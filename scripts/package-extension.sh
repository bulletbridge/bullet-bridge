#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

npm run check

VERSION="$(node -p "require('./package.json').version")"
TARGET="${1:-github}"

case "$TARGET" in
  github)
    OUT="dist/bullet-bridge-${VERSION}.zip"
    ;;
  webstore)
    OUT="dist/bullet-bridge-${VERSION}-webstore.zip"
    ;;
  *)
    echo "Unknown package target: $TARGET" >&2
    exit 1
    ;;
esac

mkdir -p dist
rm -f "$OUT"

STAGING_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$STAGING_DIR"
}
trap cleanup EXIT

cp manifest.json LICENSE PRIVACY.md TRADEMARK.md "$STAGING_DIR/"
cp -R icons src "$STAGING_DIR/"

if [[ "$TARGET" == "webstore" ]]; then
  node --input-type=module - "$STAGING_DIR/manifest.json" <<'NODE'
import fs from "node:fs";

const manifestPath = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
delete manifest.key;
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
NODE
fi

(
  cd "$STAGING_DIR"
  zip -qr "$ROOT_DIR/$OUT" manifest.json icons src LICENSE PRIVACY.md TRADEMARK.md -x "*.DS_Store"
)
unzip -tq "$OUT" >/dev/null

if [[ "$TARGET" == "webstore" ]] && unzip -p "$OUT" manifest.json | grep -q '"key"'; then
  echo "Web Store package must not include manifest.key" >&2
  exit 1
fi

echo "$OUT"
