Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Port = 3000
$RestartHour = 2
$RestartMinute = 0
$Root = $PSScriptRoot
$ManagerLog = Join-Path $Root "ServerManager.log"
$ServerLog = Join-Path $Root "server.log"
$ServerErrorLog = Join-Path $Root "server-error.log"

. (Join-Path $Root "tools\local-node-runtime.ps1")

$script:ServerProcess = $null
$script:LastNightlyRestart = $null
$script:CommandBuffer = ""
$script:ShuttingDown = $false
$script:LogTailPositions = @{ Server = 0; Error = 0 }

Set-Location $Root

function Write-Log {
    param([Parameter(Mandatory)][string]$Message)

    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Write-Host "`r$line"
    Add-Content -LiteralPath $ManagerLog -Value $line -Encoding UTF8
}

function Show-Prompt {
    Write-Host -NoNewline "Command (Status / Restart / Shutdown): $($script:CommandBuffer)"
}

function Show-LogUpdates {
    param(
        [Parameter(Mandatory)][string]$Key,
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Prefix
    )

    if (-not (Test-Path -LiteralPath $Path)) { return $false }

    try {
        $file = Get-Item -LiteralPath $Path
        $position = [long]$script:LogTailPositions[$Key]
        if ($file.Length -lt $position) { $position = 0 }
        if ($file.Length -eq $position) { return $false }

        $stream = [System.IO.File]::Open(
            $Path,
            [System.IO.FileMode]::Open,
            [System.IO.FileAccess]::Read,
            [System.IO.FileShare]::ReadWrite
        )
        try {
            $stream.Position = $position
            $reader = [System.IO.StreamReader]::new($stream, [System.Text.UTF8Encoding]::new($false), $true, 4096, $true)
            try {
                $output = $reader.ReadToEnd()
            }
            finally {
                $reader.Dispose()
            }
            $script:LogTailPositions[$Key] = $stream.Position
        }
        finally {
            $stream.Dispose()
        }

        $wrote = $false
        foreach ($line in ($output -split "`r?`n")) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            Write-Host "`r[$Prefix] $line"
            $wrote = $true
        }
        return $wrote
    }
    catch {
        # Servern kan precis ha roterat eller stangt en loggfil. Forsok igen i nasta loop.
        return $false
    }
}

function Get-NodeListener {
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

    foreach ($connection in $connections) {
        $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
        if ($process -and $process.ProcessName -ieq "node") {
            $process
        }
    }
}

function Stop-GameServer {
    $processes = @()

    if ($script:ServerProcess -and -not $script:ServerProcess.HasExited) {
        $processes += $script:ServerProcess
    }

    $processes += @(Get-NodeListener)
    $processes = @($processes | Where-Object { $_ } | Sort-Object Id -Unique)

    if ($processes.Count -eq 0) {
        Write-Log "No Node.js server is running on port $Port."
        return
    }

    foreach ($process in $processes) {
        Write-Log "Stopping server PID $($process.Id)..."
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        Wait-Process -Id $process.Id -Timeout 10 -ErrorAction SilentlyContinue
    }

    $script:ServerProcess = $null
    Write-Log "Server stopped."
}

function Start-GameServer {
    if (-not (Test-Path -LiteralPath (Join-Path $Root "server\index.js"))) {
        throw "server\index.js was not found in $Root"
    }

    $runtime = Initialize-VvcRuntime -ProjectRoot $Root

    $oldProcesses = @(Get-NodeListener)
    foreach ($oldProcess in $oldProcesses) {
        Write-Log "Stopping old Node.js server PID $($oldProcess.Id) on port $Port..."
        Stop-Process -Id $oldProcess.Id -Force -ErrorAction SilentlyContinue
        Wait-Process -Id $oldProcess.Id -Timeout 10 -ErrorAction SilentlyContinue
    }

    Write-Log "Starting Viking vs Cleo..."
    $script:LogTailPositions.Server = if (Test-Path -LiteralPath $ServerLog) { (Get-Item -LiteralPath $ServerLog).Length } else { 0 }
    $script:LogTailPositions.Error = if (Test-Path -LiteralPath $ServerErrorLog) { (Get-Item -LiteralPath $ServerErrorLog).Length } else { 0 }

    $script:ServerProcess = Start-Process `
        -FilePath $runtime.Node `
        -ArgumentList @("server/index.js") `
        -WorkingDirectory $Root `
        -RedirectStandardOutput $ServerLog `
        -RedirectStandardError $ServerErrorLog `
        -NoNewWindow `
        -PassThru

    Start-Sleep -Seconds 2
    $script:ServerProcess.Refresh()

    if ($script:ServerProcess.HasExited) {
        throw "The server stopped directly after startup. Check server-error.log."
    }

    Write-Log "Server started. PID $($script:ServerProcess.Id), port $Port."
}

function Restart-GameServer {
    param([string]$Reason = "Manual restart")

    Write-Log $Reason
    Stop-GameServer
    Start-Sleep -Seconds 3
    Start-GameServer
}

function Show-Status {
    if ($script:ServerProcess -and -not $script:ServerProcess.HasExited) {
        Write-Log "STATUS: RUNNING. PID $($script:ServerProcess.Id), port $Port."
    }
    else {
        Write-Log "STATUS: OFFLINE."
    }
}

function Invoke-CommandText {
    param([string]$Command)

    switch ($Command.Trim().ToLowerInvariant()) {
        "status"   { Show-Status }
        "restart"  { Restart-GameServer -Reason "Manual restart requested." }
        "shutdown" {
            Write-Log "Shutdown requested."
            $script:ShuttingDown = $true
            Stop-GameServer
        }
        "" { }
        default { Write-Log "Unknown command. Use Status, Restart or Shutdown." }
    }
}

function Read-ConsoleInput {
    while ([Console]::KeyAvailable) {
        $key = [Console]::ReadKey($true)

        if ($key.Key -eq [ConsoleKey]::Enter) {
            Write-Host ""
            $command = $script:CommandBuffer
            $script:CommandBuffer = ""
            Invoke-CommandText -Command $command
            if (-not $script:ShuttingDown) { Show-Prompt }
        }
        elseif ($key.Key -eq [ConsoleKey]::Backspace) {
            if ($script:CommandBuffer.Length -gt 0) {
                $script:CommandBuffer = $script:CommandBuffer.Substring(0, $script:CommandBuffer.Length - 1)
                Write-Host -NoNewline "`b `b"
            }
        }
        elseif (-not [char]::IsControl($key.KeyChar)) {
            $script:CommandBuffer += $key.KeyChar
            Write-Host -NoNewline $key.KeyChar
        }
    }
}

try {
    Clear-Host
    Write-Host "Viking vs Cleo Server Manager"
    Write-Host "Automatic restart every night at 02:00"
    Write-Host "Server output: server.log"
    Write-Host "Server errors: server-error.log"
    Write-Host "Live game events and server errors are shown below"
    Write-Host ""

    Start-GameServer
    Show-Prompt

    while (-not $script:ShuttingDown) {
        Read-ConsoleInput

        if ($script:ShuttingDown) { break }

        $serverOutput = Show-LogUpdates -Key "Server" -Path $ServerLog -Prefix "Server"
        $errorOutput = Show-LogUpdates -Key "Error" -Path $ServerErrorLog -Prefix "Server error"
        if ($serverOutput -or $errorOutput) { Show-Prompt }

        if ($script:ServerProcess -and $script:ServerProcess.HasExited) {
            Write-Host ""
            Write-Log "The server stopped unexpectedly. Restarting in 5 seconds..."
            Start-Sleep -Seconds 5
            Start-GameServer
            Show-Prompt
        }

        $now = Get-Date
        if (
            $now.Hour -eq $RestartHour -and
            $now.Minute -eq $RestartMinute -and
            $script:LastNightlyRestart -ne $now.Date
        ) {
            $script:LastNightlyRestart = $now.Date
            Write-Host ""
            Restart-GameServer -Reason "Scheduled nightly restart at 02:00."
            Show-Prompt
        }

        Start-Sleep -Milliseconds 200
    }
}
catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    Stop-GameServer
    Write-Host ""
    Write-Host "Press Enter to close."
    [void](Read-Host)
    exit 1
}

Write-Log "Server Manager stopped."
