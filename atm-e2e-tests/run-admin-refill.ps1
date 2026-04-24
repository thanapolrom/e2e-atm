param(
    [string]$DeviceId = '10.55.10.11:5555',
    [string]$AppPackage = 'com.kbao.atm.sit',
    [string]$AppUid = '',
    [string]$Spec = '.\test\specs\admin.spec.js',
    [int]$DevicePort = 5000,
    [int]$HostForwardPort = 5001,
    [int]$HostProxyPort = 5002,
    [int]$DeviceRedirectPort = 5003,
    [switch]$KeepPortsAfterRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$proxyStdoutLog = Join-Path $env:TEMP ("proxy-itl-{0}.out.log" -f [guid]::NewGuid().ToString('N'))
$proxyStderrLog = Join-Path $env:TEMP ("proxy-itl-{0}.err.log" -f [guid]::NewGuid().ToString('N'))

$proxyJob = $null
$nodePath = $null
$wdioExitCode = 0
$failureMessage = $null
$locationPushed = $false

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Info([string]$Message) {
    Write-Host "    $Message" -ForegroundColor DarkGray
}

function Resolve-CommandPath([string]$Name) {
    $command = Get-Command $Name -ErrorAction SilentlyContinue

    if (-not $command) {
        throw "Required command '$Name' was not found in PATH."
    }

    return $command.Source
}

function Get-ListeningProcessIds([int]$Port) {
    $connections = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue

    if (-not $connections) {
        return @()
    }

    return @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
}

function Invoke-Adb {
    param(
        [string[]]$AdbArgs,
        [switch]$IgnoreErrors
    )

    $output = & adb @AdbArgs 2>&1
    $exitCode = $LASTEXITCODE

    if ($output) {
        $output | ForEach-Object { Write-Info "$_" }
    }

    if (-not $IgnoreErrors -and $exitCode -ne 0) {
        throw "adb command failed: adb $($AdbArgs -join ' ')"
    }

    return @{
        Output = $output
        ExitCode = $exitCode
    }
}

function Clear-HostProxyPort {
    $listeningProcessIds = @(Get-ListeningProcessIds -Port $HostProxyPort)

    if ($listeningProcessIds.Count -eq 0) {
        return
    }

    Write-Step "Clearing existing listener(s) on host port $HostProxyPort"

    foreach ($owningProcessId in $listeningProcessIds) {
        try {
            $process = Get-Process -Id $owningProcessId -ErrorAction Stop
            Write-Info "Stopping $($process.ProcessName) (PID $owningProcessId) on port $HostProxyPort"
            Stop-Process -Id $owningProcessId -Force -ErrorAction Stop
        } catch {
            Write-Info "Failed to stop process $owningProcessId on port $HostProxyPort : $($_.Exception.Message)"
        }
    }

    Start-Sleep -Milliseconds 500
}

function Clear-PortState {
    Write-Step 'Clearing adb port mappings and OUTPUT nat rules'
    Invoke-Adb -AdbArgs @('-s', $DeviceId, 'shell', 'su', 'root', 'iptables', '-t', 'nat', '-F', 'OUTPUT') -IgnoreErrors
    Invoke-Adb -AdbArgs @('-s', $DeviceId, 'forward', '--remove-all') -IgnoreErrors
    Invoke-Adb -AdbArgs @('-s', $DeviceId, 'reverse', '--remove-all') -IgnoreErrors
}

function Get-AppUidFromDevice {
    if ($AppUid) {
        Write-Info "Using app UID override: $AppUid"
        return $AppUid
    }

    Write-Step "Detecting app UID for $AppPackage"
    $result = Invoke-Adb -AdbArgs @('-s', $DeviceId, 'shell', 'dumpsys', 'package', $AppPackage)
    $text = $result.Output | Out-String

    foreach ($pattern in @(
        '\bappId=(\d+)',
        '\buserId=(\d+)',
        '\buid[:=](\d+)'
    )) {
        $match = [regex]::Match($text, $pattern)
        if ($match.Success) {
            $resolvedUid = $match.Groups[1].Value
            Write-Info "Detected app UID: $resolvedUid"
            return $resolvedUid
        }
    }

    Write-Info 'dumpsys did not expose app UID directly, trying package list fallback'
    $fallback = Invoke-Adb -AdbArgs @('-s', $DeviceId, 'shell', 'cmd', 'package', 'list', 'packages', '-U', $AppPackage)
    $fallbackText = $fallback.Output | Out-String
    $fallbackMatch = [regex]::Match($fallbackText, '\buid:(\d+)')

    if ($fallbackMatch.Success) {
        $resolvedUid = $fallbackMatch.Groups[1].Value
        Write-Info "Detected app UID via fallback: $resolvedUid"
        return $resolvedUid
    }

    throw "Could not determine app UID for package '$AppPackage'. Pass -AppUid to override."
}

function Set-PortState([string]$ResolvedAppUid) {
    Write-Step 'Connecting adb forward/reverse ports'
    Invoke-Adb -AdbArgs @('-s', $DeviceId, 'forward', "tcp:$HostForwardPort", "tcp:$DevicePort")
    Invoke-Adb -AdbArgs @('-s', $DeviceId, 'reverse', "tcp:$DeviceRedirectPort", "tcp:$HostProxyPort")

    Write-Step 'Adding iptables redirect rule'
    Invoke-Adb -AdbArgs @(
        '-s', $DeviceId,
        'shell', 'su', 'root',
        'iptables', '-t', 'nat', '-A', 'OUTPUT',
        '-p', 'tcp',
        '-d', '127.0.0.1',
        '--dport', "$DevicePort",
        '-m', 'owner',
        '--uid-owner', "$ResolvedAppUid",
        '-j', 'REDIRECT',
        '--to-port', "$DeviceRedirectPort"
    )
}

function Wait-ProxyReady {
    param([int]$TimeoutSec = 15)

    Write-Step 'Waiting for proxy-itl.js to become ready'
    $deadline = (Get-Date).AddSeconds($TimeoutSec)

    while ((Get-Date) -lt $deadline) {
        if ($null -ne $proxyJob) {
            $proxyJob = Get-Job -Id $proxyJob.Id -ErrorAction SilentlyContinue -WarningAction SilentlyContinue
        }

        if ($null -eq $proxyJob) {
            throw "proxy-itl.js job disappeared unexpectedly. Stdout: $proxyStdoutLog | Stderr: $proxyStderrLog"
        }

        if ($proxyJob.State -in @('Completed', 'Failed', 'Stopped')) {
            throw "proxy-itl.js exited early. Stdout: $proxyStdoutLog | Stderr: $proxyStderrLog"
        }

        try {
            $null = Invoke-RestMethod -Uri "http://127.0.0.1:$HostProxyPort/test/status" -TimeoutSec 2
            $listeningProcessIds = @(Get-ListeningProcessIds -Port $HostProxyPort)

            if ($listeningProcessIds.Count -gt 0) {
                Write-Info "Proxy ready on http://127.0.0.1:$HostProxyPort"
                return
            }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }

    throw "Timed out waiting for proxy-itl.js on port $HostProxyPort. Stdout: $proxyStdoutLog | Stderr: $proxyStderrLog"
}

function Start-Proxy {
    Write-Step 'Starting proxy-itl.js'
    $proxyPath = Join-Path $repoRoot 'proxy-itl.js'

    if (-not (Test-Path $proxyPath)) {
        throw "Could not find proxy script at $proxyPath"
    }

    Clear-HostProxyPort

    $script:proxyJob = Start-Job `
        -WarningAction SilentlyContinue `
        -ScriptBlock {
            param($ResolvedNodePath, $ResolvedProxyPath, $ResolvedRepoRoot, $StdoutLog, $StderrLog)

            Set-Location $ResolvedRepoRoot
            & $ResolvedNodePath $ResolvedProxyPath 1>> $StdoutLog 2>> $StderrLog
        } `
        -ArgumentList $nodePath, $proxyPath, $repoRoot, $proxyStdoutLog, $proxyStderrLog

    Write-Info "Proxy job ID: $($proxyJob.Id)"
    Wait-ProxyReady
}

function Stop-Proxy {
    if ($null -eq $proxyJob) {
        return
    }

    try {
        $proxyJob = Get-Job -Id $proxyJob.Id -ErrorAction SilentlyContinue -WarningAction SilentlyContinue

        if ($null -ne $proxyJob -and $proxyJob.State -eq 'Running') {
            Write-Step 'Stopping proxy-itl.js'
            Stop-Job -Id $proxyJob.Id -ErrorAction Stop -WarningAction SilentlyContinue
        }
    } catch {
        Write-Info "Failed to stop proxy cleanly: $($_.Exception.Message)"
    } finally {
        if ($null -ne $proxyJob) {
            Remove-Job -Id $proxyJob.Id -Force -ErrorAction SilentlyContinue -WarningAction SilentlyContinue
        }

        Clear-HostProxyPort
    }
}

function Run-Wdio {
    $wdioPath = Join-Path $repoRoot 'node_modules\.bin\wdio.cmd'

    if (-not (Test-Path $wdioPath)) {
        throw "Could not find local WDIO binary at $wdioPath. Run npm install first."
    }

    Write-Step "Running WDIO spec: $Spec"
    & $wdioPath 'run' '.\wdio.conf.js' '--spec' $Spec
    $script:wdioExitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
}

try {
    $null = Resolve-CommandPath 'adb'
    $nodePath = Resolve-CommandPath 'node'

    Push-Location $repoRoot
    $locationPushed = $true

    Write-Step "Checking device connection for $DeviceId"
    $null = Invoke-Adb -AdbArgs @('-s', $DeviceId, 'get-state')

    Clear-PortState
    $resolvedUid = Get-AppUidFromDevice
    Set-PortState -ResolvedAppUid $resolvedUid
    Start-Proxy
    Run-Wdio

    if ($wdioExitCode -ne 0) {
        $failureMessage = "WDIO exited with code $wdioExitCode"
    }
} catch {
    if ($wdioExitCode -eq 0) {
        $wdioExitCode = 1
    }
    $failureMessage = $_.Exception.Message
} finally {
    Stop-Proxy

    if (-not $KeepPortsAfterRun) {
        try {
            Clear-PortState
        } catch {
            Write-Info "Cleanup failed: $($_.Exception.Message)"
        }
    }

    if ($locationPushed) {
        Pop-Location
    }
}

if ($failureMessage) {
    Write-Host ""
    Write-Host "Run failed: $failureMessage" -ForegroundColor Red
    Write-Info "Proxy stdout log: $proxyStdoutLog"
    Write-Info "Proxy stderr log: $proxyStderrLog"
    exit $wdioExitCode
}

Write-Host ""
Write-Host "Run completed successfully." -ForegroundColor Green
Write-Info "Proxy stdout log: $proxyStdoutLog"
Write-Info "Proxy stderr log: $proxyStderrLog"
exit 0
