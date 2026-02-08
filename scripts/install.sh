#!/usr/bin/env bash
set -euo pipefail

VERSION=""
NO_INIT=0
NO_START=0
REGISTRY=""
PREFIX=""

LOG_DIR="${HOME}/.lydia"
LOG_FILE="${LOG_DIR}/install.log"

mkdir -p "${LOG_DIR}"
touch "${LOG_FILE}"

log() {
  echo "$1" | tee -a "${LOG_FILE}"
}

usage() {
  cat <<EOF
Usage: install.sh [options]
  --version <semver|tag>  Install a specific CLI version
  --no-init               Skip lydia init
  --no-start              Skip lydia dashboard
  --registry <url>        Override npm registry
  --prefix <path>         Install using a custom npm prefix
  -h, --help              Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      VERSION="${2:-}"
      shift 2
      ;;
    --no-init)
      NO_INIT=1
      shift
      ;;
    --no-start)
      NO_START=1
      shift
      ;;
    --registry)
      REGISTRY="${2:-}"
      shift 2
      ;;
    --prefix)
      PREFIX="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      log "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  log "Node.js 18+ is required. Please install Node.js and try again."
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [[ "${NODE_MAJOR}" -lt 18 ]]; then
  log "Node.js 18+ is required. Detected Node ${NODE_MAJOR}. Please upgrade."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  log "npm is required. Please install npm and try again."
  exit 1
fi

PKG="@lydia/cli"
if [[ -n "${VERSION}" ]]; then
  PKG="${PKG}@${VERSION}"
fi

log "Installing ${PKG}..."
INSTALL_CMD=(npm install -g "${PKG}")
if [[ -n "${REGISTRY}" ]]; then
  INSTALL_CMD+=(--registry "${REGISTRY}")
fi
if [[ -n "${PREFIX}" ]]; then
  INSTALL_CMD+=(--prefix "${PREFIX}")
fi
"${INSTALL_CMD[@]}"

BIN_DIR=""
if [[ -n "${PREFIX}" ]]; then
  BIN_DIR="${PREFIX}/bin"
else
  BIN_DIR="$(npm bin -g 2>/dev/null || true)"
  if [[ -z "${BIN_DIR}" ]]; then
    PREFIX_G="$(npm prefix -g 2>/dev/null || true)"
    BIN_DIR="${PREFIX_G}/bin"
  fi
fi

if command -v lydia >/dev/null 2>&1; then
  LYDIA_BIN="lydia"
elif [[ -n "${BIN_DIR}" && -x "${BIN_DIR}/lydia" ]]; then
  LYDIA_BIN="${BIN_DIR}/lydia"
else
  log "Lydia CLI not found on PATH."
  if [[ -n "${BIN_DIR}" ]]; then
    log "Add this to your PATH: ${BIN_DIR}"
  fi
  log "Then run: lydia init"
  exit 1
fi

if [[ "${NO_INIT}" -eq 0 ]]; then
  log "Running lydia init..."
  "${LYDIA_BIN}" init
fi

if [[ "${NO_START}" -eq 0 ]]; then
  log "Starting dashboard..."
  "${LYDIA_BIN}" dashboard
fi

log "Install complete. Log saved to ${LOG_FILE}"
