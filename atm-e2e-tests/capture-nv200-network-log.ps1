param(
    [string]$DeviceId = '10.55.10.11:5555',
    [string]$OutputDir = '.\logs',
    [string[]]$Tags = @('OkHttp'),
    [string]$DeviceLogDir = '/storage/emulated/0/Pictures/sit/logs',
    [string[]]$DeviceLogPatterns = @(
        'nv200_api_*.txt',
        'nv200_logs_*.txt',
        'app_log_*.txt',
        'internet_logs_*.txt'
    ),
    [switch]$FilterKeywords,
    [string[]]$Keywords = @(
        'EnablePayout',
        'DisablePayout',
        'EnableAcceptor',
        'DisableAcceptor',
        'GetDeviceStatus',
        'GetAllLevels',
        'OpenConnection',
        'CloseConnection',
        'ESCROW',
        'STORED',
        'RECYCL',
        'PAYOUT',
        'ACCEPTOR',
        'ROUT'
    )
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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

function Invoke-Adb {
    param(
        [string[]]$AdbArgs,
        [switch]$Quiet
    )

    $prevPref = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $output = & adb @AdbArgs 2>&1
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = $prevPref

    if (-not $Quiet -and $output) {
        $output | ForEach-Object {
            if ($_ -isnot [System.Management.Automation.ErrorRecord]) {
                Write-Info "$_"
            }
        }
    }

    if ($exitCode -ne 0) {
        throw "adb command failed: adb $($AdbArgs -join ' ')"
    }

    return $output
}

function Get-LatestDeviceLogFiles {
    param(
        [string]$ResolvedDeviceLogDir,
        [string[]]$Patterns
    )

    $listing = @(Invoke-Adb -AdbArgs @('-s', $DeviceId, 'shell', 'ls', '-1t', $ResolvedDeviceLogDir) -Quiet)
    $names = @(
        $listing |
            ForEach-Object { "$_".Trim() } |
            Where-Object { $_ -and $_ -notmatch '^ls:' -and $_ -notmatch '^total\s+\d+' }
    )

    $selected = @()

    foreach ($pattern in $Patterns) {
        $matchedName = $names | Where-Object { $_ -like $pattern } | Select-Object -First 1
        if ($matchedName) {
            $selected += $matchedName
        }
    }

    return @($selected | Select-Object -Unique)
}

$null = Resolve-CommandPath 'adb'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$resolvedOutputDir = if ([System.IO.Path]::IsPathRooted($OutputDir)) {
    $OutputDir
} else {
    Join-Path $repoRoot $OutputDir
}

New-Item -ItemType Directory -Path $resolvedOutputDir -Force | Out-Null

$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$rawLogPath = Join-Path $resolvedOutputDir "nv200-network-$timestamp.log"
$matchLogPath = Join-Path $resolvedOutputDir "nv200-network-$timestamp.matches.log"
$errLogPath = Join-Path $resolvedOutputDir "nv200-network-$timestamp.err.log"
$deviceLogOutputDir = Join-Path $resolvedOutputDir "device-logs-$timestamp"

$tagArgs = foreach ($tag in $Tags) {
    '{0}:V' -f $tag
}

$keywordPattern = ($Keywords | ForEach-Object { [regex]::Escape($_) }) -join '|'
$adbArgs = @('-s', $DeviceId, 'logcat', '-v', 'threadtime') + $tagArgs + @('*:S')

$logcatProcess = $null

try {
    Write-Step "Checking device connection for $DeviceId"
    Invoke-Adb -AdbArgs @('-s', $DeviceId, 'get-state') | Out-Null

    Write-Step 'Clearing current logcat buffer'
    Invoke-Adb -AdbArgs @('-s', $DeviceId, 'logcat', '-c') | Out-Null

    Write-Step 'Starting NV200 + network log capture'
    Write-Info "Raw log: $rawLogPath"
    Write-Info "Device txt logs dir: $DeviceLogDir"
    Write-Info "Pulled txt logs dir: $deviceLogOutputDir"
    if ($FilterKeywords) {
        Write-Info "Filtered matches: $matchLogPath"
    }
    Write-Info "adb args: $($adbArgs -join ' ')"

    $logcatProcess = Start-Process `
        -FilePath 'adb' `
        -ArgumentList $adbArgs `
        -RedirectStandardOutput $rawLogPath `
        -RedirectStandardError $errLogPath `
        -WindowStyle Hidden `
        -PassThru

    Write-Host ""
    Write-Host "Capture is running. Perform the flow on the ATM, then press Enter here to stop..." -ForegroundColor Yellow
    [void][System.Console]::ReadLine()

    if ($null -ne $logcatProcess -and -not $logcatProcess.HasExited) {
        Stop-Process -Id $logcatProcess.Id -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
    }

    Write-Step 'Pulling latest device txt logs'
    New-Item -ItemType Directory -Path $deviceLogOutputDir -Force | Out-Null
    $latestDeviceLogs = @(Get-LatestDeviceLogFiles -ResolvedDeviceLogDir $DeviceLogDir -Patterns $DeviceLogPatterns)

    if ($latestDeviceLogs.Count -eq 0) {
        Write-Info 'No matching device txt logs found.'
    } else {
        foreach ($deviceLogName in $latestDeviceLogs) {
            $remotePath = "$DeviceLogDir/$deviceLogName"
            $localPath = Join-Path $deviceLogOutputDir $deviceLogName
            Write-Info "Pulling $remotePath"
            Invoke-Adb -AdbArgs @('-s', $DeviceId, 'pull', $remotePath, $localPath) | Out-Null
        }
    }

    if ($FilterKeywords) {
        Write-Step 'Searching important keywords'
        $matches = @()

        if (Test-Path $rawLogPath) {
            $matches = @(Select-String -Path $rawLogPath -Pattern $keywordPattern -SimpleMatch:$false)
        }

        if ($matches.Count -gt 0) {
            $matches | ForEach-Object { $_.Line } | Set-Content -Path $matchLogPath
            Write-Info "Found $($matches.Count) matching line(s)"
        } else {
            Set-Content -Path $matchLogPath -Value 'No keyword matches found.'
            Write-Info 'No keyword matches found.'
        }

        Write-Step 'Keyword summary'
        foreach ($keyword in $Keywords) {
            $count = @(Select-String -Path $rawLogPath -Pattern ([regex]::Escape($keyword))).Count
            if ($count -gt 0) {
                Write-Info "$keyword : $count"
            }
        }
    }

    Write-Host ""
    Write-Host "Capture completed." -ForegroundColor Green
    Write-Info "Raw log: $rawLogPath"
    Write-Info "Pulled txt logs dir: $deviceLogOutputDir"
    if ($FilterKeywords) {
        Write-Info "Filtered matches: $matchLogPath"
    }

    if ((Test-Path $errLogPath) -and (Get-Item $errLogPath).Length -gt 0) {
        Write-Info "adb stderr: $errLogPath"
    }
} finally {
    if ($null -ne $logcatProcess -and -not $logcatProcess.HasExited) {
        Stop-Process -Id $logcatProcess.Id -Force -ErrorAction SilentlyContinue
    }
}
