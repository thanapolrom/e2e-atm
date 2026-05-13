param(
    [string]$DeviceId         = '10.55.10.11:5555',
    [string]$AppPackage       = 'com.kbao.atm.sit',
    [string]$AppUid           = '',
    [int]$DevicePort          = 5000,
    [int]$HostForwardPort     = 5001,
    [int]$HostAcceptorPort    = 5002,
    [int]$DeviceRedirectPort  = 5003
)

# Flow: App -> device:5000 -> iptables -> device:5003
#   -> adb reverse -> host:5002 (proxy-acceptor.js)
#     -> host:5001 -> device:5000 (real device) [adb forward]

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot       = Split-Path -Parent $MyInvocation.MyCommand.Path
$acceptorStdout = Join-Path $env:TEMP ("proxy-acceptor-{0}.out.log" -f [guid]::NewGuid().ToString('N'))
$acceptorStderr = Join-Path $env:TEMP ("proxy-acceptor-{0}.err.log" -f [guid]::NewGuid().ToString('N'))

$acceptorJob    = $null
$nodePath       = $null
$locationPushed = $false

function Write-Step([string]$Message) { Write-Host ""; Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Info([string]$Message) { Write-Host "    $Message" -ForegroundColor DarkGray }

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
    if (-not $IgnoreErrors -and $exitCode -ne 0) { throw "adb command failed: adb $($AdbArgs -join ' ')" }
    return @{ Output = $output; ExitCode = $exitCode }
}

function Clear-Port([int]$Port) {
    $pids = @(Get-ListeningProcessIds -Port $Port)
    if ($pids.Count -eq 0) { return }
    foreach ($procId in $pids) {
        try { Stop-Process -Id $procId -Force -ErrorAction Stop } catch {}
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
    if ($AppUid) { return $AppUid }
    Write-Step "Detecting app UID for $AppPackage"
    $result = Invoke-Adb -AdbArgs @('-s', $DeviceId, 'shell', 'dumpsys', 'package', $AppPackage)
    $text   = $result.Output | Out-String
    foreach ($pattern in @('\bappId=(\d+)', '\buserId=(\d+)', '\buid[:=](\d+)')) {
        $match = [regex]::Match($text, $pattern)
        if ($match.Success) { Write-Info "UID: $($match.Groups[1].Value)"; return $match.Groups[1].Value }
    }
    throw "Could not determine app UID for '$AppPackage'."
}

function Set-PortState([string]$ResolvedAppUid) {
    Write-Step 'Setting up adb forward/reverse'
    Invoke-Adb -AdbArgs @('-s', $DeviceId, 'forward', "tcp:$HostForwardPort", "tcp:$DevicePort")
    Invoke-Adb -AdbArgs @('-s', $DeviceId, 'reverse', "tcp:$DeviceRedirectPort", "tcp:$HostAcceptorPort")
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
            Write-Info "$Name ready"
            return
        } catch { Start-Sleep -Milliseconds 500 }
    }
    throw "Timed out waiting for $Name on port $Port"
}

function Start-ProxyJob([string]$ScriptPath, [hashtable]$Env, [string]$StdoutLog, [string]$StderrLog) {
    return Start-Job `
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
}

# --- Main --------------------------------------------------------------------

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

    Write-Step 'Starting proxy-acceptor.js'
    Clear-Port -Port $HostAcceptorPort
    $script:acceptorJob = Start-ProxyJob `
        -ScriptPath (Join-Path $repoRoot 'proxy-acceptor.js') `
        -Env @{
            ACCEPTOR_PORT = "$HostAcceptorPort"
            ACCEPTOR_REAL = "http://127.0.0.1:$HostForwardPort"
            ACCEPTOR_MOCK = '1'
        } `
        -StdoutLog $acceptorStdout `
        -StderrLog $acceptorStderr
    Wait-ProxyReady -Port $HostAcceptorPort -Name 'proxy-acceptor.js'

    Write-Host ""
    Write-Host "Ready - open the ATM app and proceed to the cash deposit screen." -ForegroundColor Green
    Write-Host ""
    Write-Host "  Set notes in satang:" -ForegroundColor Yellow
    Write-Host "    Invoke-RestMethod -Uri http://localhost:$HostAcceptorPort/test/reset -Method POST -ContentType 'application/json' -Body '{""amount"": 10000}'" -ForegroundColor White
    Write-Host "    # 10000=100 THB, 50000=500 THB, 167000=1670 THB" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Check status:" -ForegroundColor Yellow
    Write-Host "    Invoke-RestMethod http://localhost:$HostAcceptorPort/test/status" -ForegroundColor White
    Write-Host ""
    Write-Host "  Press Ctrl+C to stop." -ForegroundColor DarkGray

    $linesRead = 0
    while ($true) {
        if (Test-Path $acceptorStdout) {
            $lines = @(Get-Content $acceptorStdout -ErrorAction SilentlyContinue)
            if ($lines.Count -gt $linesRead) {
                $lines[$linesRead..($lines.Count - 1)] | ForEach-Object { Write-Host "  [acceptor] $_" -ForegroundColor DarkCyan }
                $linesRead = $lines.Count
            }
        }
        Start-Sleep -Milliseconds 500
    }

} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    if ($null -ne $acceptorJob) {
        try {
            $j = Get-Job -Id $acceptorJob.Id -ErrorAction SilentlyContinue -WarningAction SilentlyContinue
            if ($null -ne $j -and $j.State -eq 'Running') { Stop-Job -Id $acceptorJob.Id -WarningAction SilentlyContinue }
        } catch {}
        Remove-Job -Id $acceptorJob.Id -Force -ErrorAction SilentlyContinue -WarningAction SilentlyContinue
        Clear-Port -Port $HostAcceptorPort
    }
    try { Clear-PortState } catch {}
    if ($locationPushed) { Pop-Location }
    Write-Host "Stopped." -ForegroundColor DarkGray
}
