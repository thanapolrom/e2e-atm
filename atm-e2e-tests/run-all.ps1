# Run all E2E flows except bill payment
# Order: withdraw -> deposit -> topup -> package -> admin
# Proxies start once and stay up for all specs.

param(
    [string]$DeviceId            = '10.55.10.11:5555',
    [string]$AppPackage          = 'com.kbao.atm.sit',
    [string]$AppUid              = '',
    [int]$DevicePort             = 5000,
    [int]$HostForwardPort        = 5001,
    [int]$HostItlProxyPort       = 5002,
    [int]$DeviceRedirectPort     = 5003,
    [int]$HostPayoutProxyPort    = 5004,
    [string[]]$Specs             = @(
        '.\test\specs\deposit.spec.js',
        '.\test\specs\withdraw.spec.js',
        '.\test\specs\topup.spec.js',
        '.\test\specs\package.spec.js'
        # admin.spec.js must run separately via run-admin-refill.ps1
        # (needs direct real-device connection for EnableAcceptor, not proxy-payout mock)
    ),
    [switch]$KeepPortsAfterRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot     = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodePath     = (Get-Command node -ErrorAction Stop).Source

$itlStdout    = Join-Path $env:TEMP ("proxy-itl-{0}.out.log"    -f [guid]::NewGuid().ToString('N'))
$itlStderr    = Join-Path $env:TEMP ("proxy-itl-{0}.err.log"    -f [guid]::NewGuid().ToString('N'))
$payoutStdout = Join-Path $env:TEMP ("proxy-payout-{0}.out.log" -f [guid]::NewGuid().ToString('N'))
$payoutStderr = Join-Path $env:TEMP ("proxy-payout-{0}.err.log" -f [guid]::NewGuid().ToString('N'))

$itlJob         = $null
$payoutJob      = $null
$locationPushed = $false
$failureMessage = $null
$results        = [ordered]@{}

function Write-Step([string]$msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Info([string]$msg)  { Write-Host "    $msg"   -ForegroundColor DarkGray }

function Get-ListeningPids([int]$Port) {
    $c = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    if (-not $c) { return @() }
    return @($c | Select-Object -ExpandProperty OwningProcess -Unique)
}

function Clear-Port([int]$Port) {
    foreach ($p in (Get-ListeningPids $Port)) {
        try { Stop-Process -Id $p -Force -ErrorAction Stop } catch { }
    }
    Start-Sleep -Milliseconds 500
}

function Invoke-Adb([string[]]$adbArgs, [switch]$IgnoreErrors) {
    $out = & adb @adbArgs 2>&1
    $ec  = $LASTEXITCODE
    if ($out) { $out | ForEach-Object { Write-Info "$_" } }
    if (-not $IgnoreErrors -and $ec -ne 0) { throw "adb failed: adb $($adbArgs -join ' ')" }
}

function Clear-PortState {
    Write-Step 'Clearing adb port mappings'
    Invoke-Adb @('-s',$DeviceId,'shell','su','root','iptables','-t','nat','-F','OUTPUT') -IgnoreErrors
    Invoke-Adb @('-s',$DeviceId,'forward','--remove-all') -IgnoreErrors
    Invoke-Adb @('-s',$DeviceId,'reverse','--remove-all') -IgnoreErrors
}

function Get-AppUidFromDevice {
    if ($AppUid) { Write-Info "Using override UID: $AppUid"; return $AppUid }
    Write-Step "Detecting app UID for $AppPackage"
    $text = (& adb -s $DeviceId shell dumpsys package $AppPackage 2>&1) | Out-String
    foreach ($pat in @('\buserId=(\d+)', '\bappId=(\d+)', '\buid[:=](\d+)')) {
        $m = [regex]::Match($text, $pat)
        if ($m.Success) { Write-Info "UID: $($m.Groups[1].Value)"; return $m.Groups[1].Value }
    }
    throw "Cannot detect app UID for $AppPackage. Pass -AppUid to override."
}

function Set-PortState([string]$uid) {
    Write-Step 'Setting up adb forward/reverse + iptables'
    Invoke-Adb @('-s',$DeviceId,'forward',"tcp:$HostForwardPort","tcp:$DevicePort")
    Invoke-Adb @('-s',$DeviceId,'reverse',"tcp:$DeviceRedirectPort","tcp:$HostItlProxyPort")
    Invoke-Adb @('-s',$DeviceId,'shell','su','root',
        'iptables','-t','nat','-A','OUTPUT',
        '-p','tcp','-d','127.0.0.1','--dport',"$DevicePort",
        '-m','owner','--uid-owner',$uid,
        '-j','REDIRECT','--to-port',"$DeviceRedirectPort")
}

function Start-ProxyJob([string]$scriptPath, [hashtable]$envVars, [string]$out, [string]$err) {
    return Start-Job -ScriptBlock {
        param($node, $proxy, $root, $ev, $o, $e)
        Set-Location $root
        foreach ($kv in $ev.GetEnumerator()) { [System.Environment]::SetEnvironmentVariable($kv.Key, $kv.Value, 'Process') }
        & $node $proxy 1>> $o 2>> $e
    } -ArgumentList $nodePath, $scriptPath, $repoRoot, $envVars, $out, $err
}

function Wait-ProxyReady([int]$Port, [string]$Name, [int]$TimeoutSec = 15) {
    Write-Step "Waiting for $Name on port $Port"
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $null = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/test/status" -TimeoutSec 2 -ErrorAction Stop
            Write-Info "$Name ready"
            return
        } catch { Start-Sleep -Milliseconds 500 }
    }
    throw "Timed out waiting for $Name on port $Port"
}

function Stop-ProxyJob($job, [string]$name, [int]$port) {
    if ($null -eq $job) { return }
    $j = Get-Job -Id $job.Id -ErrorAction SilentlyContinue
    if ($j -and $j.State -eq 'Running') {
        try { Stop-Job -Id $job.Id -ErrorAction Stop } catch { }
    }
    Remove-Job -Id $job.Id -Force -ErrorAction SilentlyContinue
    Clear-Port $port
}

# ---- Main -------------------------------------------------------------------

try {
    $null = Get-Command adb -ErrorAction Stop
    Push-Location $repoRoot
    $locationPushed = $true

    $wdioPath = Join-Path $repoRoot 'node_modules\.bin\wdio.cmd'
    if (!(Test-Path $wdioPath)) { throw "wdio not found -- run npm install first" }

    Write-Step "Checking device: $DeviceId"
    Invoke-Adb @('-s',$DeviceId,'get-state')

    Clear-PortState
    $uid = Get-AppUidFromDevice
    Set-PortState $uid

    Write-Step 'Starting proxy-payout.js'
    Clear-Port $HostPayoutProxyPort
    $payoutJob = Start-ProxyJob `
        (Join-Path $repoRoot 'proxy-payout.js') `
        @{ PAYOUT_PROXY_PORT = "$HostPayoutProxyPort"; PAYOUT_REAL = "http://127.0.0.1:$HostForwardPort"; PAYOUT_MOCK = '1' } `
        $payoutStdout $payoutStderr
    Wait-ProxyReady $HostPayoutProxyPort 'proxy-payout.js'

    Write-Step 'Starting proxy-itl.js'
    Clear-Port $HostItlProxyPort
    $itlJob = Start-ProxyJob `
        (Join-Path $repoRoot 'proxy-itl.js') `
        @{ ITL_REAL = "http://127.0.0.1:$HostPayoutProxyPort"; ITL_MOCK = '1' } `
        $itlStdout $itlStderr
    Wait-ProxyReady $HostItlProxyPort 'proxy-itl.js'

    foreach ($spec in $Specs) {
        $specName = [System.IO.Path]::GetFileNameWithoutExtension($spec)
        Write-Step "[$specName] $spec"

        & $wdioPath 'run' '.\wdio.conf.js' '--spec' $spec
        $ec = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
        $results[$specName] = $ec

        $color  = if ($ec -eq 0) { 'Green' } else { 'Red' }
        $status = if ($ec -eq 0) { 'PASS' } else { "FAIL (exit $ec)" }
        Write-Host "    [$specName] $status" -ForegroundColor $color
    }

} catch {
    $failureMessage = $_.Exception.Message
} finally {
    Stop-ProxyJob $itlJob    'proxy-itl.js'    $HostItlProxyPort
    Stop-ProxyJob $payoutJob 'proxy-payout.js' $HostPayoutProxyPort

    if (-not $KeepPortsAfterRun) {
        try { Clear-PortState } catch { Write-Info "Cleanup error: $($_.Exception.Message)" }
    }

    if ($locationPushed) { Pop-Location }
}

# ---- Summary ----------------------------------------------------------------

Write-Host ""
Write-Host "======================================" -ForegroundColor DarkGray
Write-Host " E2E Results (excluding bill)" -ForegroundColor White
Write-Host "======================================" -ForegroundColor DarkGray

$anyFail = $false
foreach ($entry in $results.GetEnumerator()) {
    $ok     = $entry.Value -eq 0
    $status = if ($ok) { 'PASS' } else { 'FAIL' }
    $color  = if ($ok) { 'Green' } else { 'Red' }
    Write-Host ("  [{0}] {1}" -f $status, $entry.Key) -ForegroundColor $color
    if (-not $ok) { $anyFail = $true }
}

if ($results.Count -eq 0) {
    Write-Host "  (no specs ran)" -ForegroundColor Yellow
}

Write-Host ""
Write-Info ("proxy-itl  stdout: {0}" -f $itlStdout)
Write-Info ("proxy-payout stdout: {0}" -f $payoutStdout)

if ($failureMessage) {
    Write-Host ("Infrastructure error: {0}" -f $failureMessage) -ForegroundColor Red
    exit 1
}

exit $(if ($anyFail) { 1 } else { 0 })
