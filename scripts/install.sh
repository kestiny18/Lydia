#!/usr/bin/env bash
set -euo pipefail

VERSION=""
NO_INIT=0
NO_START=0
REGISTRY=""
PREFIX=""
REPO="kestiny18/Lydia"

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
  --repo <owner/name>     Install from a GitHub repo when not published (default: kestiny18/Lydia)
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
    --repo)
      REPO="${2:-}"
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

install_from_registry() {
  local view_args=(npm view "@lydia/cli" version)
  if [[ -n "${REGISTRY}" ]]; then
    view_args+=(--registry "${REGISTRY}")
  fi

  if ! "${view_args[@]}" >/dev/null 2>&1; then
    return 1
  fi

  log "Installing ${PKG} from npm registry..."
  local install_cmd=(npm install -g "${PKG}")
  if [[ -n "${REGISTRY}" ]]; then
    install_cmd+=(--registry "${REGISTRY}")
  fi
  if [[ -n "${PREFIX}" ]]; then
    install_cmd+=(--prefix "${PREFIX}")
  fi
  "${install_cmd[@]}"
}

install_from_source_dir() {
  local source_dir="$1"
  log "Building and installing from source: ${source_dir}"

  if ! command -v corepack >/dev/null 2>&1; then
    log "corepack is required for source install (Node 18+)."
    exit 1
  fi

  (
    cd "${source_dir}"
    corepack enable >/dev/null 2>&1 || true
    corepack prepare pnpm@latest --activate >/dev/null
    pnpm install --frozen-lockfile
    pnpm build

    local install_cmd=(npm install -g "./packages/cli")
    if [[ -n "${REGISTRY}" ]]; then
      install_cmd+=(--registry "${REGISTRY}")
    fi
    if [[ -n "${PREFIX}" ]]; then
      install_cmd+=(--prefix "${PREFIX}")
    fi
    "${install_cmd[@]}"
  )
}

install_from_github() {
  local ref="${VERSION:-main}"
  local url="https://github.com/${REPO}/archive/refs/heads/${ref}.tar.gz"

  if ! command -v tar >/dev/null 2>&1; then
    log "tar is required for source install."
    exit 1
  fi

  local tmp_root=""
  tmp_root="$(mktemp -d 2>/dev/null || mktemp -d -t lydia)"
  local archive="${tmp_root}/lydia.tgz"

  if command -v curl >/dev/null 2>&1; then
    log "Downloading source from ${REPO}@${ref}..."
    curl -fsSL "${url}" -o "${archive}"
  elif command -v wget >/dev/null 2>&1; then
    log "Downloading source from ${REPO}@${ref}..."
    wget -qO "${archive}" "${url}"
  else
    log "curl or wget is required for source install."
    exit 1
  fi

  tar -xzf "${archive}" -C "${tmp_root}"
  local extracted=""
  extracted="$(find "${tmp_root}" -maxdepth 1 -type d ! -path "${tmp_root}" | head -n 1 || true)"
  if [[ -z "${extracted}" ]]; then
    log "Failed to extract source archive."
    exit 1
  fi

  install_from_source_dir "${extracted}"
  rm -rf "${tmp_root}"
}

if ! install_from_registry; then
  if [[ -f "./packages/cli/package.json" && -f "./pnpm-workspace.yaml" ]]; then
    log "Package @lydia/cli is not published; installing from local source checkout..."
    install_from_source_dir "$(pwd)"
  else
    log "Package @lydia/cli is not published; installing from GitHub source..."
    install_from_github
  fi
fi

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
