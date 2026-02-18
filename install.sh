#!/bin/sh
set -eu

REPO="${MIKROSCOPE_CONSOLE_REPO:-mikaelvesavuori/mikroscope-console}"
TARGET_DIR="${MIKROSCOPE_CONSOLE_DIR:-$PWD/mikroscope-console}"
VERSION=""
FORCE="false"

usage() {
  cat <<EOF
Install MikroScope Console prebuilt release bundle.

Usage:
  sh install.sh [--version vX.Y.Z] [--dir /path/to/install] [--force]

Environment:
  MIKROSCOPE_CONSOLE_REPO   GitHub repo slug (default: $REPO)
  MIKROSCOPE_CONSOLE_DIR    Install target directory (default: $TARGET_DIR)
  GH_TOKEN                  Optional GitHub token to avoid API rate limits
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version)
      VERSION="$2"
      shift 2
      ;;
    --dir)
      TARGET_DIR="$2"
      shift 2
      ;;
    --force)
      FORCE="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd curl
require_cmd tar
require_cmd mktemp

api_url="https://api.github.com/repos/$REPO/releases/latest"
if [ -n "$VERSION" ]; then
  api_url="https://api.github.com/repos/$REPO/releases/tags/$VERSION"
fi

auth_header=""
if [ -n "${GH_TOKEN:-}" ]; then
  auth_header="Authorization: Bearer $GH_TOKEN"
fi

curl_json() {
  if [ -n "$auth_header" ]; then
    curl -fsSL -H "Accept: application/vnd.github+json" -H "$auth_header" "$1"
  else
    curl -fsSL -H "Accept: application/vnd.github+json" "$1"
  fi
}

release_json="$(curl_json "$api_url")"

asset_url="$(
  printf '%s\n' "$release_json" \
    | grep -Eo '"browser_download_url":[[:space:]]*"[^"]+mikroscope-console-v[^"]+\.tar\.gz"' \
    | head -n 1 \
    | sed -E 's/^"browser_download_url":[[:space:]]*"//; s/"$//'
)"

if [ -z "$asset_url" ]; then
  echo "Could not find release tar.gz asset for $REPO (${VERSION:-latest})." >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT INT TERM

archive_path="$tmp_dir/release.tar.gz"
echo "Downloading: $asset_url"
if [ -n "$auth_header" ]; then
  curl -fsSL -H "$auth_header" -o "$archive_path" "$asset_url"
else
  curl -fsSL -o "$archive_path" "$asset_url"
fi

extract_dir="$tmp_dir/extract"
mkdir -p "$extract_dir"
tar -xzf "$archive_path" -C "$extract_dir"

bundle_dir="$(find "$extract_dir" -maxdepth 1 -type d -name 'mikroscope-console-v*' | head -n 1)"
if [ -z "$bundle_dir" ]; then
  echo "Downloaded archive did not contain expected bundle directory." >&2
  exit 1
fi

if [ -e "$TARGET_DIR" ]; then
  if [ "$FORCE" = "true" ]; then
    rm -rf "$TARGET_DIR"
  else
    echo "Target directory already exists: $TARGET_DIR" >&2
    echo "Re-run with --force to replace it." >&2
    exit 1
  fi
fi

mkdir -p "$(dirname "$TARGET_DIR")"
cp -R "$bundle_dir" "$TARGET_DIR"

echo ""
echo "Installed MikroScope Console to:"
echo "  $TARGET_DIR"
echo ""
echo "Next steps:"
echo "  1) Edit: $TARGET_DIR/public/config.json"
echo "  2) Set apiOrigin to your MikroScope API URL"
echo "  3) Serve: npx http-server $TARGET_DIR/public -p 4320 -c-1"
echo ""
