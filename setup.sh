#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${CYAN}${BOLD}[setup]${RESET} $*"; }
success() { echo -e "${GREEN}${BOLD}[setup]${RESET} $*"; }
warn()    { echo -e "${YELLOW}${BOLD}[setup]${RESET} $*"; }
fail()    { echo -e "${RED}${BOLD}[setup]${RESET} $*" >&2; exit 1; }

echo ""
echo -e "${BOLD}  DownTune — Dependency Setup${RESET}"
echo "  ─────────────────────────────"
echo ""

# ── Node.js ──────────────────────────────────────────────────────────────────

if ! command -v node &>/dev/null; then
  fail "Node.js is not installed. Install Node.js 20+ from https://nodejs.org and re-run this script."
fi

NODE_VERSION=$(node -e "process.stdout.write(process.versions.node)")
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)

if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "Node.js 20+ is required (found v${NODE_VERSION}). Upgrade at https://nodejs.org"
fi

info "Node.js v${NODE_VERSION} ✓"

# ── npm ───────────────────────────────────────────────────────────────────────

if ! command -v npm &>/dev/null; then
  fail "npm is not installed. It should come with Node.js."
fi

info "npm $(npm --version) ✓"

# ── Python 3 ─────────────────────────────────────────────────────────────────

if ! command -v python3 &>/dev/null; then
  fail "Python 3 is not installed. Install it from https://python.org and re-run this script."
fi

PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
info "Python ${PYTHON_VERSION} ✓"

# ── yt-dlp ───────────────────────────────────────────────────────────────────

if python3 -m yt_dlp --version &>/dev/null 2>&1; then
  YTDLP_VERSION=$(python3 -m yt_dlp --version 2>&1)
  info "yt-dlp ${YTDLP_VERSION} ✓"
else
  warn "yt-dlp is not installed. Attempting to install via pip..."
  if command -v pip3 &>/dev/null; then
    pip3 install yt-dlp
    success "yt-dlp installed."
  elif command -v pip &>/dev/null; then
    pip install yt-dlp
    success "yt-dlp installed."
  else
    fail "pip not found. Install yt-dlp manually: pip3 install yt-dlp"
  fi
fi

echo ""

# ── npm install ───────────────────────────────────────────────────────────────

info "Installing client dependencies..."
npm install --prefix client
success "client/node_modules ready."

echo ""

info "Installing server dependencies..."
npm install --prefix server
success "server/node_modules ready."

echo ""

# ── .env reminder ─────────────────────────────────────────────────────────────

if [ ! -f server/.env ]; then
  warn "No server/.env found. Copy server/.env.example to server/.env and fill in your credentials before running."
fi

echo ""
echo -e "  ${GREEN}${BOLD}Setup complete.${RESET}"
echo ""
echo -e "  Run ${CYAN}make dev${RESET}  — development mode (hot reload)"
echo -e "  Run ${CYAN}make run${RESET}  — build and run in production mode"
echo -e "  Run ${CYAN}make help${RESET} — see all available commands"
echo ""