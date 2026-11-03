// Copies files the browser needs at runtime into public/ (gitignored):
//   /calc-keypad/ti84ce/  KEYPAD program + CE libraries, downloaded by the installer
//   /mathlive/fonts/      MathLive's fonts (bundling breaks its default relative path)
//   /xp/                  XP.css and its fonts, linked from app/layout.tsx. Served as-is
//                         because Turbopack's CSS parser rejects a few of its selectors.
import { copyFileSync, cpSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const copies = [
  [
    dirname(require.resolve("@calc-uil/keypad/assets/ti84ce/KEYPAD.8xp")),
    "calc-keypad/ti84ce",
  ],
  [
    join(dirname(require.resolve("mathlive/fonts.css")), "fonts"),
    "mathlive/fonts",
  ],
];

for (const [source, target] of copies) {
  const dest = join(publicDir, target);
  mkdirSync(dest, { recursive: true });
  cpSync(source, dest, { recursive: true });
  console.log(`Copied ${target}`);
}

const xpDist = dirname(require.resolve("xp.css/dist/XP.css"));
const xpDest = join(publicDir, "xp");
mkdirSync(xpDest, { recursive: true });
for (const file of readdirSync(xpDist)) {
  if (file === "XP.css" || /\.woff2?$/.test(file)) {
    copyFileSync(join(xpDist, file), join(xpDest, file));
  }
}
console.log("Copied xp");
