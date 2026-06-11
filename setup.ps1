#Requires -Version 5.1
<#
.SYNOPSIS
    DownTune — Dependency Setup (Windows)
.DESCRIPTION
    Installs dependencies for DownTune. Supports Baremetal (Node.js/Python/ffmpeg/yt-dlp/make)
    and Docker (Docker Desktop) setup modes.
.PARAMETER Baremetal
    Install host prerequisites, then run 'make setup'.
.PARAMETER Docker
    Install Docker Desktop/Compose, then start containers when safe.
.PARAMETER All
    Run both Baremetal and Docker setup.
.PARAMETER Help
    Show this help.
#>

param(
    [switch]$Baremetal,
    [switch]$Docker,
    [switch]$All,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

function Write-Info    ($msg) { Write-Host "  [setup] $msg" -ForegroundColor Cyan }
function Write-Success ($msg) { Write-Host "  [setup] $msg" -ForegroundColor Green }
function Write-Warn    ($msg) { Write-Host "  [setup] $msg" -ForegroundColor Yellow }
function Write-Fail    ($msg) { Write-Host "  [setup] ERROR: $msg" -ForegroundColor Red; exit 1 }

if ($Help) {
    Write-Host ""
    Write-Host "  DownTune — Dependency Setup" -ForegroundColor White
    Write-Host "  ─────────────────────────────"
    Write-Host ""
    Write-Host "  Usage: .\setup.ps1 [-Baremetal] [-Docker] [-All] [-Help]"
    Write-Host ""
    Write-Host "    -Baremetal  Install host prerequisites, then run 'make setup'"
    Write-Host "    -Docker     Install Docker Desktop/Compose, then start containers when safe"
    Write-Host "    -All        Run both Baremetal and Docker setup"
    Write-Host "    -Help       Show this help"
    Write-Host ""
    exit 0
}

Write-Host ""
Write-Host "  DownTune — Dependency Setup" -ForegroundColor White
Write-Host "  ─────────────────────────────"
Write-Host ""

# ─── Determine mode ───────────────────────────────────────────────────────────

$Mode = ""
if ($All)            { $Mode = "all" }
elseif ($Baremetal)  { $Mode = "baremetal" }
elseif ($Docker)     { $Mode = "docker" }

if ($Mode -eq "") {
    Write-Host "  How would you like to run DownTune?"
    Write-Host ""
    Write-Host "    1) Baremetal  — install host prerequisites, then run 'make setup'"
    Write-Host "    2) Docker     — install Docker Desktop/Compose, then start containers when safe"
    Write-Host "    3) Both       — run both setups"
    Write-Host ""
    $choice = Read-Host "  Choose [1/2/3]"
    Write-Host ""
    switch ($choice) {
        "1" { $Mode = "baremetal" }
        "2" { $Mode = "docker" }
        "3" { $Mode = "all" }
        default { Write-Fail "Invalid choice '$choice'. Run .\setup.ps1 -Help for options." }
    }
}

# ─── Package manager detection ────────────────────────────────────────────────

$HasWinget = [bool](Get-Command winget -ErrorAction SilentlyContinue)
$HasChoco  = [bool](Get-Command choco  -ErrorAction SilentlyContinue)

if ($HasWinget) {
    Write-Info "Package manager: winget"
} elseif ($HasChoco) {
    Write-Info "Package manager: Chocolatey"
} else {
    Write-Warn "No package manager found. Install winget (App Installer from Microsoft Store) or Chocolatey (https://chocolatey.org) for automatic dependency installation."
}

# ─── PATH refresh ─────────────────────────────────────────────────────────────

function Update-SessionPath {
    $machinePath = [System.Environment]::GetEnvironmentVariable('PATH', 'Machine')
    $userPath    = [System.Environment]::GetEnvironmentVariable('PATH', 'User')
    $env:PATH    = (@($machinePath, $userPath) | Where-Object { $_ }) -join ';'
}

# ─── Package install helper ───────────────────────────────────────────────────

function Install-Pkg {
    param(
        [string]$Name,
        [string]$WingetId,
        [string]$ChocoId = "",
        [string]$Manual  = ""
    )

    $ok = $false

    if ($HasWinget -and $WingetId) {
        Write-Info "Installing $Name via winget..."
        winget install --id $WingetId --accept-source-agreements --accept-package-agreements -e
        if ($LASTEXITCODE -eq 0) { $ok = $true }
    }

    if (-not $ok -and $HasChoco -and $ChocoId) {
        if ($HasWinget -and $WingetId) { Write-Warn "winget did not complete cleanly; trying Chocolatey..." }
        else { Write-Info "Installing $Name via Chocolatey..." }
        choco install $ChocoId -y
        if ($LASTEXITCODE -eq 0) { $ok = $true }
    }

    if (-not $ok) {
        if (-not ($HasWinget -or $HasChoco)) {
            Write-Fail "Cannot install ${Name}: neither winget nor Chocolatey is available. $Manual"
        }
        Write-Warn "$Name installation may not have completed successfully. Check the output above."
    }

    Update-SessionPath
}

# ─── Baremetal setup ──────────────────────────────────────────────────────────

function Invoke-BaremetalSetup {
    # ── Node.js 20+ ──────────────────────────────────────────────────────────

    $nodeOk = $false
    if (Get-Command node -ErrorAction SilentlyContinue) {
        $nodeVersion = node -e "process.stdout.write(process.versions.node)"
        $nodeMajor   = [int]($nodeVersion -split '\.')[0]
        if ($nodeMajor -ge 20) {
            $nodeOk = $true
            Write-Info "Node.js v$nodeVersion ✓"
        } else {
            Write-Warn "Node.js v$nodeVersion found but 20+ is required. Upgrading..."
        }
    }

    if (-not $nodeOk) {
        Install-Pkg -Name "Node.js 20 LTS" -WingetId "OpenJS.NodeJS.LTS" -ChocoId "nodejs-lts" `
            -Manual "Install from https://nodejs.org"

        if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
            Write-Fail "Node.js not found after installation. Restart your terminal and re-run, or install from https://nodejs.org"
        }
        $nodeVersion = node -e "process.stdout.write(process.versions.node)"
        $nodeMajor   = [int]($nodeVersion -split '\.')[0]
        if ($nodeMajor -lt 20) {
            Write-Fail "Node.js v$nodeVersion is still below 20. Upgrade at https://nodejs.org"
        }
        Write-Info "Node.js v$nodeVersion ✓"
    }

    # ── npm ───────────────────────────────────────────────────────────────────

    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Fail "npm not found after Node.js installation. Check your Node.js install."
    }
    Write-Info "npm $(npm --version) ✓"

    # ── Python 3 ─────────────────────────────────────────────────────────────

    $pythonCmd = $null
    foreach ($candidate in @('python3', 'python')) {
        if (Get-Command $candidate -ErrorAction SilentlyContinue) {
            $ver = & $candidate --version 2>&1
            if ($ver -match 'Python 3') {
                $pythonCmd = $candidate
                break
            }
        }
    }

    if (-not $pythonCmd) {
        Install-Pkg -Name "Python 3" -WingetId "Python.Python.3.12" -ChocoId "python3" `
            -Manual "Install from https://python.org"

        foreach ($candidate in @('python3', 'python')) {
            if (Get-Command $candidate -ErrorAction SilentlyContinue) {
                $ver = & $candidate --version 2>&1
                if ($ver -match 'Python 3') {
                    $pythonCmd = $candidate
                    break
                }
            }
        }

        if (-not $pythonCmd) {
            Write-Fail "Python 3 not found after installation. Restart your terminal and re-run, or install from https://python.org"
        }
    }

    $pythonVersion = (& $pythonCmd --version 2>&1) -replace 'Python ', ''
    Write-Info "Python $pythonVersion ✓"

    # ── Git ───────────────────────────────────────────────────────────────────

    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Install-Pkg -Name "Git" -WingetId "Git.Git" -ChocoId "git" `
            -Manual "Install from https://git-scm.com"

        if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
            Write-Fail "Git not found after installation. Restart your terminal and re-run, or install from https://git-scm.com"
        }
    }
    $gitVersion = (git --version) -replace 'git version ', ''
    Write-Info "git $gitVersion ✓"

    # ── ffmpeg ────────────────────────────────────────────────────────────────

    if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
        Install-Pkg -Name "ffmpeg" -WingetId "Gyan.FFmpeg" -ChocoId "ffmpeg" `
            -Manual "Install from https://ffmpeg.org/download.html and add to PATH"

        if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
            Write-Warn "ffmpeg not detected after installation. You may need to restart your terminal."
            Write-Warn "Audio/video processing may not work until ffmpeg is on PATH."
        }
    }

    if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
        $ffmpegLine = ffmpeg -version 2>&1 | Select-Object -First 1
        $ffmpegVer  = if ($ffmpegLine -match 'version\s+(\S+)') { $Matches[1] } else { 'installed' }
        Write-Info "ffmpeg $ffmpegVer ✓"
    }

    # ── make ──────────────────────────────────────────────────────────────────

    if (-not (Get-Command make -ErrorAction SilentlyContinue)) {
        Write-Warn "make not found. Attempting to install..."
        $makeOk = $false

        if ($HasChoco) {
            choco install make -y 2>&1 | Out-Null
            Update-SessionPath
            if (Get-Command make -ErrorAction SilentlyContinue) { $makeOk = $true }
        }

        if (-not $makeOk -and $HasWinget) {
            winget install --id GnuWin32.Make --accept-source-agreements --accept-package-agreements -e 2>&1 | Out-Null
            Update-SessionPath
            if (Get-Command make -ErrorAction SilentlyContinue) { $makeOk = $true }
        }

        if (-not $makeOk) {
            Write-Warn "make could not be installed automatically."
            Write-Warn "Install via: choco install make  -or-  winget install GnuWin32.Make"
            Write-Warn "Until then, run npm scripts directly instead of make targets."
        }
    }

    if (Get-Command make -ErrorAction SilentlyContinue) {
        $makeVer = (make --version 2>&1 | Select-Object -First 1)
        Write-Info "make $makeVer ✓"
    }

    # ── yt-dlp ────────────────────────────────────────────────────────────────

    $ytdlpOk = $false
    try {
        $ytdlpVersion = & $pythonCmd -m yt_dlp --version 2>&1
        if ($LASTEXITCODE -eq 0) { $ytdlpOk = $true }
    } catch {}

    if ($ytdlpOk) {
        Write-Info "yt-dlp $ytdlpVersion ✓"
    } else {
        Write-Warn "yt-dlp not found. Installing via pip --user..."
        & $pythonCmd -m pip install --user --upgrade yt-dlp
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "yt-dlp installation failed. Try manually: $pythonCmd -m pip install --user yt-dlp"
        }

        $ytdlpVersion = & $pythonCmd -m yt_dlp --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "yt-dlp $ytdlpVersion installed."
        } else {
            Write-Warn "yt-dlp installed but module not yet detectable — this is usually fine."
            Write-Warn "The server invokes it as: $pythonCmd -m yt_dlp"
        }
    }

    Write-Host ""

    # ── App dependencies (delegated to make setup) ────────────────────────────

    if (-not (Get-Command make -ErrorAction SilentlyContinue)) {
        Write-Fail "make not found — cannot run 'make setup'. Install make (choco install make  -or-  winget install GnuWin32.Make) and re-run."
    }
    Write-Info "Installing app dependencies..."
    make setup
    if ($LASTEXITCODE -ne 0) { Write-Fail "make setup failed. Check the output above." }

    Write-Host ""

    if (-not (Test-Path "server\.env")) {
        if (Test-Path "server\.env.example") {
            Copy-Item "server\.env.example" "server\.env"
            Write-Success "Created server\.env from server\.env.example."
            Write-Warn "Review server\.env and fill in any credentials before running."
        } else {
            Write-Warn "No server\.env found. Create it from server\.env.example before running."
        }
    }
}

# ─── Docker setup ─────────────────────────────────────────────────────────────

function Invoke-DockerSetup {
    # ── Install Docker Desktop ────────────────────────────────────────────────

    $dockerPresent = [bool](Get-Command docker -ErrorAction SilentlyContinue)

    if (-not $dockerPresent) {
        Write-Info "Installing Docker Desktop..."
        Install-Pkg -Name "Docker Desktop" `
            -WingetId "Docker.DockerDesktop" `
            -ChocoId  "docker-desktop" `
            -Manual   "Install from https://www.docker.com/products/docker-desktop/"
        Update-SessionPath
        $dockerPresent = [bool](Get-Command docker -ErrorAction SilentlyContinue)
    } else {
        Write-Info "Docker already installed — skipping."
    }

    Write-Warn "Docker Desktop must be running for docker commands to work."
    Write-Warn "Start Docker Desktop from the Start menu before running 'docker compose up'."

    if (-not $dockerPresent) {
        Write-Warn "docker command not found — Docker Desktop may need a terminal restart or may still be installing."
        Write-Warn "After starting Docker Desktop, verify with: docker --version"
    } else {
        try {
            $dockerVer = (docker --version) -replace 'Docker version ', '' -replace ',.*', ''
            Write-Info "docker $dockerVer ✓"
        } catch {
            Write-Warn "docker command found but version check failed — Docker Desktop may not be running yet."
        }
    }

    # ── Verify Docker Compose ─────────────────────────────────────────────────

    $composeOk = $false
    if ($dockerPresent) {
        try {
            $composeVer = docker compose version --short 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Info "docker compose $composeVer ✓"
                $composeOk = $true
            }
        } catch {}
    }

    if (-not $composeOk) {
        Write-Warn "docker compose plugin not detected — it is bundled with Docker Desktop."
        Write-Warn "Start Docker Desktop and re-run this script if the plugin is still missing."
    }

    # ── Validate docker-compose.yml ──────────────────────────────────────────

    if (-not (Test-Path "docker-compose.yml")) {
        Write-Fail "docker-compose.yml not found. Run this script from the DownTune repo root."
    }

    # ── Guard against placeholder volume ─────────────────────────────────────

    $composeContent = Get-Content "docker-compose.yml" -Raw
    if ($composeContent -match '/your/path/here') {
        Write-Fail "docker-compose.yml still contains the placeholder volume '/your/path/here'.`nEdit docker-compose.yml to replace it with your actual downloads directory, then re-run."
    }

    # ── Check daemon accessibility and run compose ────────────────────────────

    if (-not $composeOk) {
        Write-Warn "docker compose not available — skipping container start."
        Write-Warn "Start Docker Desktop, then re-run: .\setup.ps1 -Docker"
        return
    }

    $daemonOk = $false
    try {
        $null = docker ps 2>&1
        if ($LASTEXITCODE -eq 0) { $daemonOk = $true }
    } catch {}

    if (-not $daemonOk) {
        Write-Warn "Docker daemon is not responding. Start Docker Desktop from the Start menu."
        Write-Warn "Then re-run: .\setup.ps1 -Docker"
        return
    }

    Write-Info "Starting DownTune containers..."
    docker compose up --build -d
    if ($LASTEXITCODE -ne 0) { Write-Fail "docker compose up failed. Check the output above." }
    $script:DockerComposeStarted = $true
    Write-Success "DownTune containers started."
}

# ─── Run selected mode ────────────────────────────────────────────────────────

$script:DockerComposeStarted = $false

switch ($Mode) {
    "baremetal" { Invoke-BaremetalSetup }
    "docker"    { Invoke-DockerSetup }
    "all"       { Invoke-BaremetalSetup; Write-Host ""; Invoke-DockerSetup }
}

Write-Host ""
Write-Host "  Setup complete." -ForegroundColor Green
Write-Host ""

switch ($Mode) {
    "baremetal" {
        Write-Host "  make dev   " -ForegroundColor Cyan -NoNewline; Write-Host "— development mode (hot reload)"
        Write-Host "  make run   " -ForegroundColor Cyan -NoNewline; Write-Host "— build and run in production mode"
        Write-Host "  make help  " -ForegroundColor Cyan -NoNewline; Write-Host "— see all available commands"
    }
    "docker" {
        if ($script:DockerComposeStarted) {
            Write-Host "  docker compose logs -f  " -ForegroundColor Cyan -NoNewline; Write-Host "— follow logs"
            Write-Host "  docker compose down     " -ForegroundColor Cyan -NoNewline; Write-Host "— stop containers"
        } else {
            Write-Host "  Next steps:" -ForegroundColor White
            Write-Host "  1. Edit " -NoNewline
            Write-Host "docker-compose.yml" -ForegroundColor Cyan -NoNewline
            Write-Host " — set volume paths, then re-run " -NoNewline
            Write-Host ".\setup.ps1 -Docker" -ForegroundColor Cyan
            Write-Host "  2. Or after starting Docker Desktop: " -NoNewline
            Write-Host "docker compose up --build -d" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "  docker compose logs -f  " -ForegroundColor Cyan -NoNewline; Write-Host "— follow logs"
            Write-Host "  docker compose down     " -ForegroundColor Cyan -NoNewline; Write-Host "— stop containers"
        }
    }
    "all" {
        Write-Host "  make dev   " -ForegroundColor Cyan -NoNewline; Write-Host "— development mode (hot reload)"
        Write-Host "  make run   " -ForegroundColor Cyan -NoNewline; Write-Host "— build and run in production mode"
        Write-Host ""
        if ($script:DockerComposeStarted) {
            Write-Host "  Docker:" -ForegroundColor White
            Write-Host "  docker compose logs -f  " -ForegroundColor Cyan -NoNewline; Write-Host "— follow logs"
            Write-Host "  docker compose down     " -ForegroundColor Cyan -NoNewline; Write-Host "— stop containers"
        } else {
            Write-Host "  Docker next steps:" -ForegroundColor White
            Write-Host "  1. Edit " -NoNewline
            Write-Host "docker-compose.yml" -ForegroundColor Cyan -NoNewline
            Write-Host " — set volume paths, then re-run " -NoNewline
            Write-Host ".\setup.ps1 -Docker" -ForegroundColor Cyan
            Write-Host "  2. Or after starting Docker Desktop: " -NoNewline
            Write-Host "docker compose up --build -d" -ForegroundColor Cyan
        }
    }
}
Write-Host ""
