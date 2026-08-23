# Color Harmony Wheel — Photoshop UXP Plugin

## Project Overview

Real-time color harmony analysis plugin for Adobe Photoshop. Extracts dominant colors from the active document and visualizes them on a color wheel, showing proximity to standard color harmonies during retouching and color grading.

## Tech Stack

- **Platform**: Adobe UXP (manifest v6, apiVersion 2)
- **UI**: WebView panel (HTML5 Canvas/SVG)
- **Language**: TypeScript
- **Framework**: React (via Bolt UXP)
- **Bundler**: Vite
- **Target**: Photoshop 27.0+ (2026+)

## Architecture

Two execution contexts communicating via `postMessage`:

1. **UXP Context** — Photoshop API access, pixel acquisition (`imaging.getPixels`), color extraction (MMCQ), harmony scoring
2. **WebView Context** — Color wheel rendering, palette display, harmony overlay. Presentational,
   with one exception: it reports whether the panel is on screen, because nothing in the UXP
   context can tell. See [docs/panel-visibility.md](docs/panel-visibility.md).

Algorithms in `src/algorithms/` are pure functions with no PS dependencies — fully testable in Node.js.

## Key Conventions

- Follow DDD, SRP, KISS principles
- Tests first (AAA pattern). Pyramid: unit > integration > e2e.
- Domain/business logic in `src/algorithms/` (color extraction, harmony scoring): BDD via Gherkin `.feature` files + `@amiceli/vitest-cucumber`, colocated as `<name>.feature` + `<name>.feature.test.ts` in `src/__tests__/`. Technical/infra code (debounce, dispose, bridge plumbing) stays plain AAA `describe`/`it`.
- Files: `kebab-case.ts`, Types: `PascalCase`, Functions: `camelCase`
- Keep algorithms pure and side-effect free
- `executeAsModal` scopes must be minimal (acquire pixels, exit immediately)
- Always dispose `PhotoshopImageData` after use
- Debounce PS events (300-500ms) before re-analysis
- Use `logger` abstraction (`src/lib/logger.ts`) for all logging — never raw `console.*`
- Every step must have passing tests before moving to the next

## Important Docs

- [CONTRIBUTING.md](CONTRIBUTING.md) — Setup, workflow, PR process
- [docs/adr/](docs/adr/) — Architecture Decision Records
- [docs/analysis-*.md](docs/) — Research & analysis
- [docs/project-structure.md](docs/project-structure.md) — Directory layout
- [docs/implementation-plan.md](docs/implementation-plan.md) — MVP step-by-step plan
- [docs/manual-testing-in-photoshop.md](docs/manual-testing-in-photoshop.md) — Driving PS/UDT from a terminal
- [docs/panel-visibility.md](docs/panel-visibility.md) — Why the WebView, not Photoshop, says the panel closed

## Common Commands

```bash
yarn dev             # Vite dev server + hot reload (WebSocket-based)
yarn build           # Production build to plugin/
yarn package         # Build + package as .ccx
yarn zip             # Bundle .ccx + assets into .zip
yarn test            # Run unit tests (Vitest)
yarn test:watch      # Tests in watch mode
yarn lint            # ESLint
yarn typecheck       # TypeScript checks
```

## Bolt UXP Notes

- Config lives in `uxp.config.ts` (not manifest.json directly — Bolt generates it)
- Use "Load" in UDT, **not** "Load and Watch" — Bolt handles reloading via WebSocket
- `yarn build` must run before first `yarn dev`
- See [CONTRIBUTING.md](CONTRIBUTING.md) for full setup guide

## UXP-Specific Notes

- UXP is NOT a browser. Limited HTML/CSS subset in UXP context.
- WebView IS a browser (Edge on Windows, Safari on macOS).
- `require("photoshop")` only available in UXP context, never in WebView.
- Use `imaging.getPixels({ targetSize: { width: 100 } })` for performance.
- Test on both Windows and macOS before distribution.
- Script-made edits (`do javascript`) never emit `historyStateChanged`, so they do not trigger
  re-analysis — trigger it from the UI. See [docs/manual-testing-in-photoshop.md](docs/manual-testing-in-photoshop.md).
