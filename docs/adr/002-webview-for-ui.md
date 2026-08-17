# ADR-002: Use WebView for Color Wheel UI Rendering

**Status**: Accepted
**Date**: 2025-02-25
**Amended**: 2026-08-17 — manifest requirement clarified as a floor, not a pin

## Context

The plugin needs to render a color wheel with positioned dots, harmony overlays, and smooth updates. UXP offers native 2D Canvas (basic shapes only) and WebView (full browser engine).

## Options

| Option                | Pros                                               | Cons                                                     |
| --------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| **UXP native Canvas** | No extra complexity                                | Basic shapes only, no radial gradients, no complex paths |
| **UXP native SVG**    | Declarative                                        | Buggy for complex SVGs, limited feature support          |
| **WebView**           | Full Canvas/SVG/CSS/animations, Edge/Safari engine | Extra message passing, manifest v5 or later required     |

## Decision

Use **WebView** for the color wheel panel UI.

## Rationale

- Color wheel requires radial gradients, arc paths, positioned elements, and smooth transitions
- UXP native Canvas and SVG are too limited for this use case
- WebView provides a full browser engine at no runtime cost (already bundled with PS)
- Communication overhead via `postMessage` is negligible (~1ms) for our data volume
- Local HTML support (UXP v8.0) eliminates need for remote hosting

## Consequences

- Requires `requiredPermissions.webview`, introduced in manifest v5. That is a
  floor, not a pin — the project ships v6, see [ADR-006](006-manifest-v6.md).
- Two build targets: UXP bundle + WebView bundle
- Data must be serialized across the boundary (simple JSON)
- Must style WebView to match Photoshop dark theme
