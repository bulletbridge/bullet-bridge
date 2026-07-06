#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

npm run check

VERSION="$(node -p "require('./package.json').version")"
OUT="dist/bullet-bridge-${VERSION}.zip"

mkdir -p dist
rm -f "$OUT"

zip -qr "$OUT" manifest.json icons src LICENSE PRIVACY.md TRADEMARK.md -x "*.DS_Store"
unzip -tq "$OUT" >/dev/null

echo "$OUT"
