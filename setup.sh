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

# ─── Argument parsing ─────────────────────────────────────────────────────────

MODE=""
for arg in "$@"; do
  case "$arg" in
    --baremetal) MODE="baremetal" ;;
    --docker)    MODE="docker" ;;
    --all)       MODE="all" ;;
    --help|-h)
      echo "Usage: ./setup.sh [--baremetal|--docker|--all|--help]"
      echo ""
      echo "  --baremetal  Install host prerequisites, then run 'make setup'"
      echo "  --docker     Install Docker + Compose, then run 'docker compose up --build -d' when safe"
      echo "  --all        Run both baremetal and Docker setup"
      echo "  --help       Show this help"
      exit 0
      ;;
    *)
      echo -e "${RED}${BOLD}[setup]${RESET} Unknown option: $arg" >&2
      echo "Run ./setup.sh --help for usage." >&2
      exit 1
      ;;
  esac
done

# ─── Interactive mode selection ───────────────────────────────────────────────

if [ -z "$MODE" ]; then
  echo -e "  How would you like to run DownTune?"
  echo ""
  echo -e "    ${BOLD}1)${RESET} Baremetal  — install host prerequisites, then run 'make setup'"
  echo -e "    ${BOLD}2)${RESET} Docker     — install Docker/Compose, then start containers when safe"
  echo -e "    ${BOLD}3)${RESET} Both       — run both setups"
  echo ""
  read -rp "  Choose [1/2/3]: " _choice
  echo ""
  case "$_choice" in
    1) MODE="baremetal" ;;
    2) MODE="docker" ;;
    3) MODE="all" ;;
    *) fail "Invalid choice '$_choice'. Run ./setup.sh --help for options." ;;
  esac
fi

# ─── Privilege escalation ─────────────────────────────────────────────────────

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if   command -v sudo &>/dev/null; then SUDO="sudo"
  elif command -v doas &>/dev/null; then SUDO="doas"
  fi
fi

# ─── Package manager detection ────────────────────────────────────────────────

PM="none"
if   command -v apt-get &>/dev/null; then PM="apt"
elif command -v dnf     &>/dev/null; then PM="dnf"
elif command -v yum     &>/dev/null; then PM="yum"
elif command -v pacman  &>/dev/null; then PM="pacman"
elif command -v zypper  &>/dev/null; then PM="zypper"
elif command -v brew    &>/dev/null; then PM="brew"
fi

info "Package manager: ${PM}"

require_install() {
  local name="$1"
  if [ "$PM" = "none" ]; then
    fail "Cannot install ${name}: no supported package manager found (apt/dnf/yum/pacman/zypper/brew). Install manually and re-run."
  fi
  if [ "$PM" != "brew" ] && [ "$(id -u)" -ne 0 ] && [ -z "$SUDO" ]; then
    fail "Cannot install ${name}: not running as root and no sudo/doas found. Run as root or install sudo."
  fi
}

# Lazy apt-get update — runs at most once per invocation (reset by docker repo setup)
_apt_updated=false
apt_install() {
  if ! $_apt_updated; then
    info "Updating apt package lists..."
    $SUDO apt-get update -q
    _apt_updated=true
  fi
  $SUDO apt-get install -y "$@"
}

# ─── Base tools: curl and git (needed by both baremetal and docker paths) ──────

install_base_tools() {
  if ! command -v curl &>/dev/null; then
    require_install curl
    info "Installing curl..."
    case "$PM" in
      apt)    apt_install curl ;;
      dnf)    $SUDO dnf install -y curl ;;
      yum)    $SUDO yum install -y curl ;;
      pacman) $SUDO pacman -S --noconfirm curl ;;
      zypper) $SUDO zypper install -y curl ;;
      brew)   brew install curl ;;
    esac
  fi
  info "curl $(curl --version | head -1 | awk '{print $2}') ✓"

  if ! command -v git &>/dev/null; then
    require_install git
    info "Installing git..."
    case "$PM" in
      apt)    apt_install git ;;
      dnf)    $SUDO dnf install -y git ;;
      yum)    $SUDO yum install -y git ;;
      pacman) $SUDO pacman -S --noconfirm git ;;
      zypper) $SUDO zypper install -y git ;;
      brew)   brew install git ;;
    esac
  fi
  info "git $(git --version | awk '{print $3}') ✓"
}

# ─── Baremetal setup ──────────────────────────────────────────────────────────

setup_baremetal() {
  install_base_tools

  # ── Build tools (make, gcc) ───────────────────────────────────────────────

  if ! command -v make &>/dev/null; then
    require_install make
    info "Installing build tools..."
    case "$PM" in
      apt)    apt_install build-essential ;;
      dnf)    $SUDO dnf install -y make gcc gcc-c++ ;;
      yum)    $SUDO yum install -y make gcc gcc-c++ ;;
      pacman) $SUDO pacman -S --noconfirm base-devel ;;
      zypper) $SUDO zypper install -y make gcc gcc-c++ ;;
      brew)
        if ! xcode-select -p &>/dev/null; then
          warn "Xcode Command Line Tools required. Run: xcode-select --install"
        fi
        ;;
    esac
  fi
  if command -v make &>/dev/null; then
    info "make $(make --version | head -1) ✓"
  else
    warn "make not found — 'make dev' / 'make run' targets won't work."
  fi

  # ── Python 3 ──────────────────────────────────────────────────────────────

  if ! command -v python3 &>/dev/null; then
    require_install python3
    info "Installing Python 3..."
    case "$PM" in
      apt)    apt_install python3 python3-pip python3-venv ;;
      dnf)    $SUDO dnf install -y python3 python3-pip ;;
      yum)    $SUDO yum install -y python3 python3-pip ;;
      pacman) $SUDO pacman -S --noconfirm python python-pip ;;
      zypper) $SUDO zypper install -y python3 python3-pip ;;
      brew)   brew install python3 ;;
    esac
  fi
  PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
  info "Python ${PYTHON_VERSION} ✓"

  if ! python3 -m pip --version &>/dev/null 2>&1; then
    require_install python3-pip
    info "Installing pip..."
    case "$PM" in
      apt)    apt_install python3-pip ;;
      dnf)    $SUDO dnf install -y python3-pip ;;
      yum)    $SUDO yum install -y python3-pip ;;
      pacman) $SUDO pacman -S --noconfirm python-pip ;;
      zypper) $SUDO zypper install -y python3-pip ;;
      brew)   python3 -m ensurepip --upgrade ;;
    esac
  fi

  if ! python3 -c "import venv" 2>/dev/null; then
    info "Installing python3-venv..."
    case "$PM" in
      apt) apt_install python3-venv ;;
      *)   : ;;
    esac
  fi

  # ── Node.js 20+ ───────────────────────────────────────────────────────────

  _need_node=false
  if command -v node &>/dev/null; then
    _node_major=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))" 2>/dev/null || echo 0)
    if [ "${_node_major}" -lt 20 ]; then
      warn "Node.js v$(node --version) found but 20+ is required. Upgrading..."
      _need_node=true
    fi
  else
    _need_node=true
  fi

  if $_need_node; then
    require_install "Node.js 20+"
    info "Installing Node.js 20..."
    case "$PM" in
      apt)
        apt_install ca-certificates gnupg
        curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO bash -
        apt_install nodejs
        ;;
      dnf)
        curl -fsSL https://rpm.nodesource.com/setup_20.x | $SUDO bash -
        $SUDO dnf install -y nodejs
        ;;
      yum)
        curl -fsSL https://rpm.nodesource.com/setup_20.x | $SUDO bash -
        $SUDO yum install -y nodejs
        ;;
      pacman)
        $SUDO pacman -S --noconfirm nodejs npm
        ;;
      zypper)
        $SUDO zypper install -y nodejs20 npm20 2>/dev/null \
          || $SUDO zypper install -y nodejs npm
        ;;
      brew)
        brew install node@20
        brew link --overwrite --force node@20
        ;;
    esac
  fi

  if ! command -v node &>/dev/null; then
    fail "Node.js installation failed. Install Node.js 20+ from https://nodejs.org and re-run."
  fi
  NODE_VERSION=$(node -e "process.stdout.write(process.versions.node)")
  _node_major=$(echo "$NODE_VERSION" | cut -d. -f1)
  if [ "$_node_major" -lt 20 ]; then
    fail "Node.js v${NODE_VERSION} is still below 20. Upgrade at https://nodejs.org"
  fi
  info "Node.js v${NODE_VERSION} ✓"

  if ! command -v npm &>/dev/null; then
    fail "npm not found after Node.js installation. Check your Node.js install."
  fi
  info "npm $(npm --version) ✓"

  # ── ffmpeg ────────────────────────────────────────────────────────────────

  if ! command -v ffmpeg &>/dev/null; then
    require_install ffmpeg
    info "Installing ffmpeg..."
    _ffmpeg_ok=false
    case "$PM" in
      apt)
        apt_install ffmpeg && _ffmpeg_ok=true
        ;;
      dnf)
        if $SUDO dnf install -y ffmpeg 2>/dev/null; then
          _ffmpeg_ok=true
        else
          warn "ffmpeg not in default dnf repos. Enable RPM Fusion: https://rpmfusion.org/Configuration"
          warn "Then run: sudo dnf install ffmpeg"
        fi
        ;;
      yum)
        if { $SUDO yum install -y epel-release && $SUDO yum install -y ffmpeg; } 2>/dev/null; then
          _ffmpeg_ok=true
        else
          warn "ffmpeg install failed. Enable EPEL+RPM Fusion then: sudo yum install ffmpeg"
        fi
        ;;
      pacman)
        $SUDO pacman -S --noconfirm ffmpeg && _ffmpeg_ok=true
        ;;
      zypper)
        if $SUDO zypper install -y ffmpeg 2>/dev/null; then
          _ffmpeg_ok=true
        else
          warn "ffmpeg not found. Add Packman repo: https://en.opensuse.org/SDB:Codecs_and_restricted_formats"
          warn "Then run: sudo zypper install ffmpeg"
        fi
        ;;
      brew)
        brew install ffmpeg && _ffmpeg_ok=true
        ;;
    esac
    if ! $_ffmpeg_ok; then
      warn "ffmpeg could not be installed automatically. Audio/video processing may not work."
    fi
  fi

  if command -v ffmpeg &>/dev/null; then
    _ffmpeg_ver=$(ffmpeg -version 2>&1 | head -1 | awk '{print $3}')
    info "ffmpeg ${_ffmpeg_ver} ✓"
  fi

  # ── yt-dlp ────────────────────────────────────────────────────────────────

  YTDLP_VENV="${HOME}/.local/share/downtune-venv"

  _ytdlp_ok=false
  if python3 -m yt_dlp --version &>/dev/null 2>&1; then
    _ytdlp_ok=true
  elif [ -x "${YTDLP_VENV}/bin/python3" ] && "${YTDLP_VENV}/bin/python3" -m yt_dlp --version &>/dev/null 2>&1; then
    _ytdlp_ok=true
  fi

  if $_ytdlp_ok; then
    _ytdlp_ver=$(python3 -m yt_dlp --version 2>&1 \
      || "${YTDLP_VENV}/bin/python3" -m yt_dlp --version 2>&1 \
      || echo "installed")
    info "yt-dlp ${_ytdlp_ver} ✓"
  else
    warn "yt-dlp not found. Installing..."
    _ytdlp_installed=false

    if python3 -c "import sys; sys.exit(0 if sys.prefix != sys.base_prefix else 1)" 2>/dev/null; then
      python3 -m pip install --upgrade yt-dlp
      _ytdlp_installed=true
    fi

    if ! $_ytdlp_installed; then
      if python3 -m pip install --user --upgrade yt-dlp; then
        _ytdlp_installed=true
      fi
    fi

    if ! $_ytdlp_installed; then
      warn "pip --user install failed. Creating venv at ${YTDLP_VENV}..."
      if ! python3 -c "import venv" 2>/dev/null; then
        fail "python3 venv module unavailable. Install python3-venv and re-run."
      fi
      python3 -m venv "${YTDLP_VENV}"
      "${YTDLP_VENV}/bin/pip" install --upgrade yt-dlp
      _ytdlp_installed=true
      warn "yt-dlp installed in ${YTDLP_VENV}. Add ${YTDLP_VENV}/bin to your PATH."
    fi

    if python3 -m yt_dlp --version &>/dev/null 2>&1 \
       || { [ -x "${YTDLP_VENV}/bin/python3" ] && "${YTDLP_VENV}/bin/python3" -m yt_dlp --version &>/dev/null 2>&1; }; then
      success "yt-dlp installed."
    else
      fail "yt-dlp installation failed. Try manually: pip3 install --user yt-dlp"
    fi
  fi

  echo ""

  # ── App dependencies (delegated to make setup) ────────────────────────────

  if ! command -v make &>/dev/null; then
    fail "make not found — cannot run 'make setup'. Install make and re-run."
  fi
  info "Installing app dependencies..."
  make setup

  echo ""

  if [ ! -f server/.env ]; then
    warn "No server/.env found. Copy server/.env.example to server/.env and fill in your credentials before running."
  fi
}

# ─── Docker setup ─────────────────────────────────────────────────────────────

setup_docker() {
  install_base_tools

  info "Setting up Docker..."

  # ── Install Docker engine ──────────────────────────────────────────────────

  if ! command -v docker &>/dev/null; then
    require_install docker
    info "Installing Docker..."
    case "$PM" in
      apt)
        apt_install ca-certificates gnupg
        $SUDO install -m 0755 -d /etc/apt/keyrings
        _distro_id=$(. /etc/os-release && echo "$ID")
        _distro_codename=$(. /etc/os-release && echo "$VERSION_CODENAME")
        curl -fsSL "https://download.docker.com/linux/${_distro_id}/gpg" \
          | $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        $SUDO chmod a+r /etc/apt/keyrings/docker.gpg
        echo \
          "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/${_distro_id} ${_distro_codename} stable" \
          | $SUDO tee /etc/apt/sources.list.d/docker.list > /dev/null
        info "Refreshing apt package lists (Docker repository added)..."
        $SUDO apt-get update -q
        $SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        ;;
      dnf)
        if ! $SUDO dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin 2>/dev/null; then
          warn "docker-ce not available; trying moby-engine..."
          $SUDO dnf install -y moby-engine docker-compose 2>/dev/null \
            || fail "Docker install failed. Add Docker CE repo: https://docs.docker.com/engine/install/fedora/"
        fi
        ;;
      yum)
        if ! $SUDO yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin 2>/dev/null; then
          warn "docker-ce not available; trying moby-engine..."
          $SUDO yum install -y moby-engine docker-compose 2>/dev/null \
            || fail "Docker install failed. Add Docker CE repo: https://docs.docker.com/engine/install/centos/"
        fi
        ;;
      pacman)
        $SUDO pacman -S --noconfirm docker docker-compose
        ;;
      zypper)
        $SUDO zypper install -y docker docker-compose
        ;;
      brew)
        brew install docker docker-compose
        warn "Docker Desktop or colima must be running for the Docker daemon to work."
        warn "Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
        ;;
    esac
  else
    info "Docker already installed — skipping."
  fi

  # ── Enable and start Docker service (Linux systemd only) ──────────────────

  if [ "$PM" != "brew" ] && command -v systemctl &>/dev/null; then
    if ! systemctl is-active --quiet docker 2>/dev/null; then
      info "Enabling and starting Docker service..."
      $SUDO systemctl enable --now docker
    fi
  fi

  # ── docker group membership ────────────────────────────────────────────────

  if [ "$PM" != "brew" ] && command -v docker &>/dev/null; then
    _current_user="${USER:-$(id -un)}"
    if ! groups "$_current_user" 2>/dev/null | grep -qw docker; then
      info "Adding ${_current_user} to the docker group..."
      $SUDO usermod -aG docker "$_current_user"
      warn "Group change takes effect in a new login session."
      warn "To apply immediately without logging out, run: newgrp docker"
    fi
  fi

  # ── Verify docker ──────────────────────────────────────────────────────────

  if ! command -v docker &>/dev/null; then
    fail "docker command not found after installation. Check the output above."
  fi
  _docker_ver=$(docker --version | awk '{print $3}' | tr -d ',')
  info "docker ${_docker_ver} ✓"

  # ── Verify docker compose ──────────────────────────────────────────────────

  _compose_ok=false
  if docker compose version &>/dev/null 2>&1; then
    _compose_ok=true
    _compose_ver=$(docker compose version --short 2>/dev/null \
      || docker compose version | awk '{print $NF}')
    info "docker compose ${_compose_ver} ✓"
  elif command -v docker-compose &>/dev/null; then
    _compose_ok=true
    _compose_ver=$(docker-compose --version | awk '{print $3}' | tr -d ',')
    info "docker-compose ${_compose_ver} ✓"
    warn "Using legacy docker-compose; consider upgrading to Docker Compose v2 (docker compose plugin)."
  fi

  if ! $_compose_ok; then
    info "Installing Docker Compose..."
    case "$PM" in
      apt)    $SUDO apt-get install -y docker-compose-plugin ;;
      dnf)    $SUDO dnf install -y docker-compose-plugin 2>/dev/null \
                || $SUDO dnf install -y docker-compose 2>/dev/null || true ;;
      yum)    $SUDO yum install -y docker-compose-plugin 2>/dev/null \
                || $SUDO yum install -y docker-compose 2>/dev/null || true ;;
      pacman) $SUDO pacman -S --noconfirm docker-compose ;;
      zypper) $SUDO zypper install -y docker-compose ;;
      brew)   brew install docker-compose ;;
    esac
    if docker compose version &>/dev/null 2>&1 || command -v docker-compose &>/dev/null; then
      success "Docker Compose installed."
    else
      fail "Docker Compose not found after installation. Install docker-compose-plugin or docker-compose and re-run."
    fi
  fi

  # ── Validate docker-compose.yml ───────────────────────────────────────────

  if [ ! -f docker-compose.yml ]; then
    fail "docker-compose.yml not found. Run this script from the DownTune repo root."
  fi

  # ── Guard against placeholder volume ──────────────────────────────────────

  if grep -q '/your/path/here' docker-compose.yml 2>/dev/null; then
    fail "docker-compose.yml still contains the placeholder volume '/your/path/here'."$'\n'"Edit docker-compose.yml to replace it with your actual downloads directory, then re-run."
  fi

  # ── Check daemon accessibility and run compose ────────────────────────────

  if ! docker ps &>/dev/null 2>&1; then
    warn "Docker daemon is not accessible in this shell."
    warn "If you were just added to the docker group, apply the change with:"
    warn "  newgrp docker"
    warn "then re-run: ./setup.sh --docker"
    _docker_compose_started=false
    return 0
  fi

  info "Starting DownTune containers..."
  if docker compose version &>/dev/null 2>&1; then
    docker compose up --build -d
  else
    docker-compose up --build -d
  fi
  _docker_compose_started=true
  success "DownTune containers started."
}

# ─── Run selected mode ────────────────────────────────────────────────────────

_docker_compose_started=false

case "$MODE" in
  baremetal)
    setup_baremetal
    ;;
  docker)
    setup_docker
    ;;
  all)
    setup_baremetal
    echo ""
    setup_docker
    ;;
esac

echo ""
echo -e "  ${GREEN}${BOLD}Setup complete.${RESET}"
echo ""

case "$MODE" in
  baremetal)
    echo -e "  Run ${CYAN}make dev${RESET}  — development mode (hot reload)"
    echo -e "  Run ${CYAN}make run${RESET}  — build and run in production mode"
    echo -e "  Run ${CYAN}make help${RESET} — see all available commands"
    ;;
  docker)
    if $_docker_compose_started; then
      echo -e "  ${CYAN}docker compose logs -f${RESET}  — follow logs"
      echo -e "  ${CYAN}docker compose down${RESET}      — stop containers"
    else
      echo -e "  ${BOLD}Next steps:${RESET}"
      echo -e "  1. Edit ${CYAN}docker-compose.yml${RESET} — set volume paths, then re-run ${CYAN}./setup.sh --docker${RESET}"
      echo -e "  2. Or after re-login/newgrp: ${CYAN}docker compose up --build -d${RESET}"
      echo ""
      echo -e "  ${CYAN}docker compose logs -f${RESET}  — follow logs"
      echo -e "  ${CYAN}docker compose down${RESET}      — stop containers"
    fi
    ;;
  all)
    echo -e "  Run ${CYAN}make dev${RESET}  — development mode (hot reload)"
    echo -e "  Run ${CYAN}make run${RESET}  — build and run in production mode"
    echo ""
    if $_docker_compose_started; then
      echo -e "  ${BOLD}Docker:${RESET}"
      echo -e "  ${CYAN}docker compose logs -f${RESET}  — follow logs"
      echo -e "  ${CYAN}docker compose down${RESET}      — stop containers"
    else
      echo -e "  ${BOLD}Docker next steps:${RESET}"
      echo -e "  1. Edit ${CYAN}docker-compose.yml${RESET} — set volume paths, then re-run ${CYAN}./setup.sh --docker${RESET}"
      echo -e "  2. Or after re-login/newgrp: ${CYAN}docker compose up --build -d${RESET}"
    fi
    ;;
esac
echo ""
