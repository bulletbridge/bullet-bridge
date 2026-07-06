import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const requiredFiles = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.options_ui.page,
  "src/popup.js",
  "src/options.js",
  "src/shared/api.js",
  "src/shared/config.js",
  "src/shared/context-menu.js",
  "src/shared/demo-data.js",
  "src/shared/device-cleanup.js",
  "src/shared/mirrored-notifications.js",
  "src/shared/push-search.js",
  "src/shared/storage.js",
  "src/assets/demo-image.svg",
  "src/assets/demo-preview.svg",
  "src/assets/demo-video.mp4",
  "src/assets/demo-video-poster.svg",
  "src/styles.css",
  "src/popup.css",
  "src/options.css",
  "README.md",
  "PRIVACY.md",
  "TRADEMARK.md",
  "CHANGELOG.md",
  "RELEASE_CHECKLIST.md",
  "scripts/package-extension.sh",
  "LICENSE"
];

for (const iconPath of Object.values(manifest.icons || {})) {
  requiredFiles.push(iconPath);
}

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  throw new Error(`Missing files:\n${missing.join("\n")}`);
}

const forbidden = [
  /pushbullet_token/i,
  /access_token\s*[:=]\s*["'][^"']{12,}/i,
  /o\.[A-Za-z0-9_-]{20,}/
];

for (const file of walk(root)) {
  if (file.includes(`${path.sep}.git${path.sep}`)) {
    continue;
  }
  if (path.relative(root, file) === "scripts/validate.js") {
    continue;
  }

  const ext = path.extname(file);
  if (![".js", ".json", ".html", ".css", ".md"].includes(ext)) {
    continue;
  }

  const content = fs.readFileSync(file, "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(content)) {
      throw new Error(`Possible secret found in ${path.relative(root, file)}`);
    }
  }
}

console.log("Extension structure looks valid.");

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
    } else {
      yield fullPath;
    }
  }
}
