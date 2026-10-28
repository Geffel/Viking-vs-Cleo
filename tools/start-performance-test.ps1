Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Manager = Join-Path $ProjectRoot "ServerManager.ps1"
$Url = "http://localhost:3000/performance-test"

function Test-PerformanceServer {
    try {
        $response = Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/performance-test" -TimeoutSec 1
        return $response.ready -eq $true -and $response.localObserver -eq $true `
            -and $response.dedicatedPage -eq $true -and $response.featureVersion -ge 3
    }
    catch {
        return $false
    }
}

if (-not (Test-PerformanceServer)) {
    Start-Process `
        -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $Manager) `
        -WorkingDirectory $ProjectRoot
}

$ready = $false
for ($attempt = 0; $attempt -lt 1200; $attempt++) {
    if (Test-PerformanceServer) {
        $ready = $true
        break
    }
    Start-Sleep -Milliseconds 250
}

if (-not $ready) { throw "The game server did not start on port 3000 within five minutes." }
Start-Process -FilePath $Url
