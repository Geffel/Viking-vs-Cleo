Set-StrictMode -Version Latest

function Get-VvcRuntimeSpec {
    $machineArchitecture = if (
        $env:PROCESSOR_ARCHITECTURE -eq "ARM64" -or
        $env:PROCESSOR_ARCHITEW6432 -eq "ARM64"
    ) { "arm64" } else { "x64" }

    $checksums = @{
        x64 = "ca1bff5d8ead13c9f2ea404a176db46bd430704d5b5113734049fa365e7799e2"
        arm64 = "f47968c213105077f64c6510f007632c0ca2574802a0b5067c327c49abe1c468"
    }

    [pscustomobject]@{
        Version = "24.22.2"
        Architecture = $machineArchitecture
        ArchiveName = "node-v24.22.2-win-$machineArchitecture.zip"
        Sha256 = $checksums[$machineArchitecture]
    }
}

function Install-VvcNodeRuntime {
    param([Parameter(Mandatory)][string]$ProjectRoot)

    $spec = Get-VvcRuntimeSpec
    $runtimeRoot = Join-Path $ProjectRoot ".runtime"
    $targetDirectory = Join-Path $runtimeRoot "node-v$($spec.Version)-win-$($spec.Architecture)"
    $nodeExe = Join-Path $targetDirectory "node.exe"
    $npmCmd = Join-Path $targetDirectory "npm.cmd"

    if ((Test-Path -LiteralPath $nodeExe) -and (Test-Path -LiteralPath $npmCmd)) {
        $installedVersion = (& $nodeExe --version).TrimStart("v")
        if ($LASTEXITCODE -eq 0 -and $installedVersion -eq $spec.Version) {
            return [pscustomobject]@{
                Version = $spec.Version
                Architecture = $spec.Architecture
                Node = $nodeExe
                Npm = $npmCmd
            }
        }
    }

    $mutex = [Threading.Mutex]::new($false, "Local\VikingVsCleoNodeRuntime")
    $hasMutex = $false
    try {
        $hasMutex = $mutex.WaitOne([TimeSpan]::FromMinutes(5))
        if (-not $hasMutex) { throw "Timed out while waiting for another runtime installation." }

        if ((Test-Path -LiteralPath $nodeExe) -and (Test-Path -LiteralPath $npmCmd)) {
            $installedVersion = (& $nodeExe --version).TrimStart("v")
            if ($LASTEXITCODE -eq 0 -and $installedVersion -eq $spec.Version) {
                return [pscustomobject]@{
                    Version = $spec.Version
                    Architecture = $spec.Architecture
                    Node = $nodeExe
                    Npm = $npmCmd
                }
            }
        }

        New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
        $archivePath = Join-Path $runtimeRoot $spec.ArchiveName
        $extractDirectory = Join-Path $runtimeRoot ("extract-" + [Guid]::NewGuid().ToString("N"))
        $downloadUrl = "https://nodejs.org/dist/v$($spec.Version)/$($spec.ArchiveName)"

        try {
            Write-Host "First start: downloading the private Node.js $($spec.Version) runtime..."
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -Uri $downloadUrl -OutFile $archivePath -UseBasicParsing -ErrorAction Stop

            $actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($actualHash -ne $spec.Sha256) {
                throw "The Node.js download failed SHA-256 verification."
            }

            New-Item -ItemType Directory -Path $extractDirectory -Force | Out-Null
            Expand-Archive -LiteralPath $archivePath -DestinationPath $extractDirectory -Force
            $expandedDirectory = Join-Path $extractDirectory "node-v$($spec.Version)-win-$($spec.Architecture)"
            if (-not (Test-Path -LiteralPath (Join-Path $expandedDirectory "node.exe"))) {
                throw "The downloaded Node.js archive did not contain node.exe."
            }

            if (Test-Path -LiteralPath $targetDirectory) {
                Remove-Item -LiteralPath $targetDirectory -Recurse -Force
            }
            Move-Item -LiteralPath $expandedDirectory -Destination $targetDirectory
            Write-Host "Node.js $($spec.Version) installed locally for Viking vs Cleo."
        }
        finally {
            if (Test-Path -LiteralPath $archivePath) {
                Remove-Item -LiteralPath $archivePath -Force
            }
            if (Test-Path -LiteralPath $extractDirectory) {
                Remove-Item -LiteralPath $extractDirectory -Recurse -Force
            }
        }
    }
    finally {
        if ($hasMutex) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }

    if (-not (Test-Path -LiteralPath $nodeExe) -or -not (Test-Path -LiteralPath $npmCmd)) {
        throw "The local Node.js installation did not complete."
    }

    [pscustomobject]@{
        Version = $spec.Version
        Architecture = $spec.Architecture
        Node = $nodeExe
        Npm = $npmCmd
    }
}

function Initialize-VvcRuntime {
    param([Parameter(Mandatory)][string]$ProjectRoot)

    $runtime = Install-VvcNodeRuntime -ProjectRoot $ProjectRoot
    $runtimeCheckOutput = & $runtime.Node (Join-Path $ProjectRoot "tools\check-runtime.mjs")
    if ($LASTEXITCODE -ne 0) {
        throw "The local Node.js runtime failed validation."
    }
    foreach ($line in $runtimeCheckOutput) { Write-Host $line }

    $packageLock = Join-Path $ProjectRoot "package-lock.json"
    $nodeModules = Join-Path $ProjectRoot "node_modules"
    $dependencyStamp = Join-Path $nodeModules ".vvc-package-lock.sha256"
    $packageLockHash = (Get-FileHash -LiteralPath $packageLock -Algorithm SHA256).Hash.ToLowerInvariant()
    $installedHash = if (Test-Path -LiteralPath $dependencyStamp) {
        [IO.File]::ReadAllText($dependencyStamp).Trim()
    } else { "" }

    if (-not (Test-Path -LiteralPath $nodeModules) -or $installedHash -ne $packageLockHash) {
        Write-Host "Installing project dependencies from package-lock.json..."
        $npmOutput = & $runtime.Npm ci --prefix $ProjectRoot
        if ($LASTEXITCODE -ne 0) {
            throw "npm ci failed with exit code $LASTEXITCODE."
        }
        foreach ($line in $npmOutput) { Write-Host $line }
        [IO.File]::WriteAllText($dependencyStamp, "$packageLockHash`n")
    }

    return $runtime
}
