#Requires -Version 5.1
<#
.SYNOPSIS
    DownTune — Dependency Setup (Windows)
.DESCRIPTION
    Checks for required tools (Node.js 20+, npm, Python 3, yt-dlp) and installs
    npm dependencies for the client and server.
#>

$ErrorActionPreference = 'Stop'

function Write-Info    ($msg) { Write-Host "  [setup] $msg" -ForegroundColor Cyan }
function Write-Success ($msg) { Write-Host "  [setup] $msg" -ForegroundColor Green }
function Write-Warn    ($msg) { Write-Host "  [setup] $msg" -ForegroundColor Yellow }
function Write-Fail    ($msg) { Write-Host "  [setup] ERROR: $msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  DownTune — Dependency Setup" -ForegroundColor White
Write-Host "  ─────────────────────────────"
Write-Host ""

# ── Node.js ──────────────────────────────────────────────────────────────────

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Fail "Node.js is not installed. Install Node.js 20+ from https://nodejs.org and re-run this script."
}

$nodeVersion = node -e "process.stdout.write(process.versions.node)"
$nodeMajor   = [int]($nodeVersion -split '\.')[0]

if ($nodeMajor -lt 20) {
    Write-Fail "Node.js 20+ is required (found v$nodeVersion). Upgrade at https://nodejs.org"
}

Write-Info "Node.js v$nodeVersion ✓"

# ── npm ───────────────────────────────────────────────────────────────────────

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Fail "npm is not installed. It should come bundled with Node.js."
}

$npmVersion = npm --version
Write-Info "npm $npmVersion ✓"

# ── Python 3 ─────────────────────────────────────────────────────────────────

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
    Write-Fail "Python 3 is not installed. Install it from https://python.org and re-run this script."
}

$pythonVersion = (& $pythonCmd --version 2>&1) -replace 'Python ', ''
Write-Info "Python $pythonVersion ✓"

# ── yt-dlp ───────────────────────────────────────────────────────────────────

$ytdlpOk = $false
try {
    $ytdlpVersion = & $pythonCmd -m yt_dlp --version 2>&1
    if ($LASTEXITCODE -eq 0) { $ytdlpOk = $true }
} catch {}

if ($ytdlpOk) {
    Write-Info "yt-dlp $ytdlpVersion ✓"
} else {
    Write-Warn "yt-dlp is not installed. Attempting to install via pip..."
    $pipCmd = $null
    foreach ($candidate in @('pip3', 'pip')) {
        if (Get-Command $candidate -ErrorAction SilentlyContinue) {
            $pipCmd = $candidate; break
        }
    }
    if (-not $pipCmd) {
        Write-Fail "pip not found. Install yt-dlp manually: pip install yt-dlp"
    }
    & $pipCmd install yt-dlp
    if ($LASTEXITCODE -ne 0) { Write-Fail "yt-dlp installation failed." }
    Write-Success "yt-dlp installed."
}

Write-Host ""

# ── npm install ───────────────────────────────────────────────────────────────

Write-Info "Installing client dependencies..."
npm install --prefix client
if ($LASTEXITCODE -ne 0) { Write-Fail "Failed to install client dependencies." }
Write-Success "client/node_modules ready."

Write-Host ""

Write-Info "Installing server dependencies..."
npm install --prefix server
if ($LASTEXITCODE -ne 0) { Write-Fail "Failed to install server dependencies." }
Write-Success "server/node_modules ready."

Write-Host ""

# ── .env reminder ─────────────────────────────────────────────────────────────

if (-not (Test-Path "server\.env")) {
    Write-Warn "No server\.env found. Copy server\.env.example to server\.env and fill in your credentials before running."
}

Write-Host ""
Write-Host "  Setup complete." -ForegroundColor Green
Write-Host ""
Write-Host "  make dev   " -ForegroundColor Cyan -NoNewline; Write-Host "— development mode (hot reload)"
Write-Host "  make run   " -ForegroundColor Cyan -NoNewline; Write-Host "— build and run in production mode"
Write-Host "  make help  " -ForegroundColor Cyan -NoNewline; Write-Host "— see all available commands"
Write-Host ""
