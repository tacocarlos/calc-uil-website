# web

The Next.js site (App Router, Cache Components on). Run it from the repo root with `npm run dev`.

- `/practice` mounts `<CalcKeypadProvider>` in its layout. The UI lives in `src/components/calc/`, built on the hooks from `@calc-uil/keypad/react`.
- The look is Windows XP: widgets come from [XP.css](https://botoxparty.github.io/XP.css/), and the desktop, taskbar and windows are in `src/components/xp/`. XP.css is linked from `public/xp/` rather than imported, because Turbopack's CSS parser rejects a few of its selectors.
- `predev`/`prebuild` build the workspace package and run `scripts/copy-public-assets.mjs`. That copies the calculator files, MathLive's fonts and XP.css into `public/` (gitignored).
- Read `AGENTS.md` before changing Next.js code. This Next version differs from older docs.
