param(
    [string]$DeviceId            = '10.55.10.11:5555',
    [string]$AppPackage          = 'com.kbao.atm.sit',
    [string]$AppUid              = '',
    [string]$Spec                = '.\test\specs\withdraw.spec.js',
    [int]$DevicePort             = 5000,   # port ที่ app บน device เรียก
    [int]$HostForwardPort        = 5001,   # adb forward host:5001 → device:5000 (real device)
    [int]$HostItlProxyPort       = 5002,   # proxy-itl.js (รับจาก device ผ่าน adb reverse)
    [int]$DeviceRedirectPort     = 5003,   # adb reverse device:5003 → host:5002
    [int]$HostPayoutProxyPort    = 5004,   # proxy-payout.js (itl forward มาที่นี่)
    [switch]$KeepPortsAfterRun
)

# ─── Flow ─────────────────────────────────────────────────────────────────────
# App → device:5000 → iptables → device:5003
#   → adb reverse → host:5002 (proxy-itl.js)
#     → host:5004 (proxy-payout.js)   [ITL_REAL=http://127.0.0.1:5004]
#       → host:5001 → device:5000 (real device)  [adb forward]

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot        = Split-Path -Parent $MyInvocation.MyCommand.Path
$itlStdout       = Join-Path $env:TEMP ("proxy-itl-{0}.out.log"    -f [guid]::NewGuid().ToString('N'))
$itlStderr       = Join-Path $env:TEMP ("proxy-itl-{0}.err.log"    -f [guid]::NewGuid().ToString('N'))
$payoutStdout    = Join-Path $env:TEMP ("proxy-payout-{0}.out.log" -f [guid]::NewGuid().ToString('N'))
$payoutStderr    = Join-Path $env:TEMP ("proxy-payout-{0}.err.log" -f [guid]::NewGuid().ToString('N'))

$itlJob          = $null
$payoutJob       = $null
$nodePath        = $null
$wdioExitCode    = 0
$failureMessage  = $null
$locationPushed  = $false

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Info([string]$Message) {
    Write-Host "    $Message" -ForegroundColor DarkGray
}

function Resolve-CommandPath([string]$Name) {
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) { throw "Required command '$Name' was not found in PATH." }
    return $command.Source
}

function Get-ListeningProcessIds([int]$Port) {
    $connections = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    if (-not $connections) { return @() }
    return @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
}

function Invoke-Adb {
    param([string[]]$AdbArgs, [switch]$IgnoreErrors)
    $output   = & adb @AdbArgs 2>&1
    $exitCode = $LASTEXITCODE
    if ($output) { $output | ForEach-Object { Write-Info "$_" } }
    if (-not $IgnoreErrors -and $exitCode -ne 0) {
        throw "adb command failed: adb $($AdbArgs -join ' ')"
    }
    return @{ Output = $output; ExitCode = $exitCode }
}

function Clear-Port([int]$Port) {
    $pids = @(Get-ListeningProcessIds -Port $Port)
    if ($pids.Count -eq 0) { return }
    Write-Step "Clearing port $Port"
    foreach ($pid in $pids) {
        try {
            $p = Get-Process -Id $pid -ErrorAction Stop
            Write-Info "Stopping $($p.ProcessName) (PID $pid)"
            Stop-Process -Id $pid -Force -ErrorAction Stop
        } catch {
            Write-Info "Could not stop PID $pid : $($_.Exception.Message)"
        }
    }
    Start-Sleep -Milliseconds 500
}

function Clear-PortState {
    Write-Step 'Clearing adb port mappings'
    Invoke-Adb -AdbArgs @('-s', $DeviceId, 'shell', 'su', 'root', 'iptables', '-t', 'nat', '-F', 'OUTPUT') -IgnoreErrors
    Invoke-Adb -AdbArgs @('-s', $DeviceId, 'forward', '--remove-all') -IgnoreErrors
    Invoke-Adb -AdbArgs @('-s', $DeviceId, 'reverse', '--remove-all') -IgnoreErrors
}

function Get-AppUidFromDevice {
    if ($AppUid) { Write-Info "Using app UID override: $AppUid"; return $AppUid }

    Write-Step "Detecting app UID for $AppPackage"
    $result = Invoke-Adb -AdbArgs @('-s', $DeviceId, 'shell', 'dumpsys', 'package', $AppPackage)
    $text   = $result.Output | Out-String

    foreach ($pattern in @('\bappId=(\d+)', '\buserId=(\d+)', '\buid[:=](\d+)')) {
        $match = [regex]::Match($text, $pattern)
        if ($match.Success) {
            Write-Info "Detected app UID: $($match.Groups[1].Value)"
            return $match.Groups[1].Value
        }
    }

    $fallback = Invoke-Adb -AdbArgs @('-s', $DeviceId, 'shell', 'cmd', 'package', 'list', 'packages', '-U', $AppPackage)
    $fm = [regex]::Match(($fallback.Output | Out-String), '\buid:(\d+)')
    if ($fm.Success) {
        Write-Info "Detected app UID (fallback): $($fm.Groups[1].Value)"
        return $fm.Groups[1].Value
    }

    throw "Could not determine app UID for '$AppPackage'. Pass -AppUid to override."
}

function Set-PortState([string]$ResolvedAppUid) {
    Write-Step 'Setting up adb forward/reverse'
    Invoke-Adb -AdbArgs @('-s', $DeviceId, 'forward', "tcp:$HostForwardPort", "tcp:$DevicePort")
    Invoke-Adb -AdbArgs @('-s', $DeviceId, 'reverse', "tcp:$DeviceRedirectPort", "tcp:$HostItlProxyPort")

    Write-Step 'Adding iptables redirect'
    Invoke-Adb -AdbArgs @(
        '-s', $DeviceId, 'shell', 'su', 'root',
        'iptables', '-t', 'nat', '-A', 'OUTPUT',
        '-p', 'tcp', '-d', '127.0.0.1', '--dport', "$DevicePort",
        '-m', 'owner', '--uid-owner', "$ResolvedAppUid",
        '-j', 'REDIRECT', '--to-port', "$DeviceRedirectPort"
    )
}

function Wait-ProxyReady([int]$Port, [string]$Name, [int]$TimeoutSec = 15) {
    Write-Step "Waiting for $Name on port $Port"
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $null = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/test/status" -TimeoutSec 2
            Write-Info "$Name ready on http://127.0.0.1:$Port"
            return
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    throw "Timed out waiting for $Name on port $Port"
}

function Start-ProxyJob([string]$ScriptPath, [hashtable]$Env, [string]$StdoutLog, [string]$StderrLog) {
    $job = Start-Job `
        -WarningAction SilentlyContinue `
        -ScriptBlock {
            param($NodePath, $ProxyPath, $RepoRoot, $EnvVars, $StdOut, $StdErr)
            Set-Location $RepoRoot
            foreach ($kv in $EnvVars.GetEnumerator()) {
                [System.Environment]::SetEnvironmentVariable($kv.Key, $kv.Value, 'Process')
            }
            & $NodePath $ProxyPath 1>> $StdOut 2>> $StdErr
        } `
        -ArgumentList $nodePath, $ScriptPath, $repoRoot, $Env, $StdoutLog, $StderrLog
    return $job
}

function Stop-ProxyJob($Job, [string]$Name, [int]$Port) {
    if ($null -eq $Job) { return }
    try {
        $j = Get-Job -Id $Job.Id -ErrorAction SilentlyContinue -WarningAction SilentlyContinue
        if ($null -ne $j -and $j.State -eq 'Running') {
            Write-Step "Stopping $Name"
            Stop-Job -Id $Job.Id -ErrorAction Stop -WarningAction SilentlyContinue
        }
    } catch {
        Write-Info "Failed to stop $Name : $($_.Exception.Message)"
    } finally {
        Remove-Job -Id $Job.Id -Force -ErrorAction SilentlyContinue -WarningAction SilentlyContinue
        Clear-Port -Port $Port
    }
}

function Run-Wdio {
    $wdioPath = Join-Path $repoRoot 'node_modules\.bin\wdio.cmd'
    if (-not (Test-Path $wdioPath)) { throw "WDIO not found. Run npm install first." }

    Write-Step "Running WDIO spec: $Spec"
    & $wdioPath 'run' '.\wdio.conf.js' '--spec' $Spec
    $script:wdioExitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
}

# ─── Main ─────────────────────────────────────────────────────────────────────

try {
    $null     = Resolve-CommandPath 'adb'
    $nodePath = Resolve-CommandPath 'node'

    Push-Location $repoRoot
    $locationPushed = $true

    Write-Step "Checking device: $DeviceId"
    $null = Invoke-Adb -AdbArgs @('-s', $DeviceId, 'get-state')

    Clear-PortState
    $resolvedUid = Get-AppUidFromDevice
    Set-PortState -ResolvedAppUid $resolvedUid

    # 1. รัน proxy-payout ก่อน (port 5004) — รับต่อจาก proxy-itl, forward ไป real device (5001)
    Write-Step 'Starting proxy-payout.js'
    Clear-Port -Port $HostPayoutProxyPort
    $script:payoutJob = Start-ProxyJob `
        -ScriptPath (Join-Path $repoRoot 'proxy-payout.js') `
        -Env @{
            PAYOUT_PROXY_PORT = "$HostPayoutProxyPort"
            PAYOUT_REAL       = "http://127.0.0.1:$HostForwardPort"
            PAYOUT_MOCK       = '1'
        } `
        -StdoutLog $payoutStdout `
        -StderrLog $payoutStderr
    Wait-ProxyReady -Port $HostPayoutProxyPort -Name 'proxy-payout.js'

    # 2. รัน proxy-itl (port 5002) — forward ไปที่ proxy-payout (5004) แทน real device โดยตรง
    Write-Step 'Starting proxy-itl.js'
    Clear-Port -Port $HostItlProxyPort
    $script:itlJob = Start-ProxyJob `
        -ScriptPath (Join-Path $repoRoot 'proxy-itl.js') `
        -Env @{
            ITL_REAL      = "http://127.0.0.1:$HostPayoutProxyPort"
            ITL_MOCK      = '1'
        } `
        -StdoutLog $itlStdout `
        -StderrLog $itlStderr
    Wait-ProxyReady -Port $HostItlProxyPort -Name 'proxy-itl.js'

    # 3. รัน test
    Run-Wdio

    if ($wdioExitCode -ne 0) { $failureMessage = "WDIO exited with code $wdioExitCode" }

} catch {
    if ($wdioExitCode -eq 0) { $wdioExitCode = 1 }
    $failureMessage = $_.Exception.Message
} finally {
    Stop-ProxyJob -Job $itlJob    -Name 'proxy-itl.js'    -Port $HostItlProxyPort
    Stop-ProxyJob -Job $payoutJob -Name 'proxy-payout.js' -Port $HostPayoutProxyPort

    if (-not $KeepPortsAfterRun) {
        try { Clear-PortState } catch { Write-Info "Cleanup error: $($_.Exception.Message)" }
    }

    if ($locationPushed) { Pop-Location }
}

if ($failureMessage) {
    Write-Host ""
    Write-Host "Run failed: $failureMessage" -ForegroundColor Red
    Write-Info "proxy-itl  stdout : $itlStdout"
    Write-Info "proxy-itl  stderr : $itlStderr"
    Write-Info "proxy-payout stdout: $payoutStdout"
    Write-Info "proxy-payout stderr: $payoutStderr"
    exit $wdioExitCode
}

Write-Host ""
Write-Host "Run completed successfully." -ForegroundColor Green
Write-Info "proxy-itl  stdout : $itlStdout"
Write-Info "proxy-payout stdout: $payoutStdout"
exit 0
