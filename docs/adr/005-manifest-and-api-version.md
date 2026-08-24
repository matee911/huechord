# ADR-005: Use Manifest v5 and apiVersion 2

**Status**: Superseded by [ADR-006](006-manifest-v6.md)
**Date**: 2025-02-25
**Amended**: 2026-08-17 — Consequences clarified (read-only pixel reads)
**Superseded**: 2026-08-17 — see [ADR-006](006-manifest-v6.md)

## Context

UXP manifest version and Photoshop apiVersion determine available features and minimum PS compatibility.

## Decision

Use **manifest v5** with **apiVersion 2**, targeting **PS 26.0+** (Photoshop 2025).

## Rationale

- Manifest v5 is required for WebView ([ADR-002](002-webview-for-ui.md)) and hybrid plugin support
- apiVersion 1 is deprecated; new features are apiVersion 2 only
- PS 26.0 ships with UXP v8.0 (local WebView HTML, Spectrum Web Components)
- Targeting PS 26+ (2025) is reasonable — users doing color grading typically run recent versions
- No benefit to supporting older versions given our WebView dependency

## Manifest Skeleton

```json
{
  "manifestVersion": 5,
  "id": "com.matee.huechord",
  "name": "Huechord",
  "version": "1.0.0",
  "main": "index.js",
  "host": [
    {
      "app": "PS",
      "minVersion": "26.0.0",
      "data": { "apiVersion": 2 }
    }
  ],
  "entrypoints": [
    {
      "type": "panel",
      "id": "mainPanel",
      "label": { "default": "Huechord" },
      "minimumSize": { "width": 280, "height": 300 },
      "maximumSize": { "width": 600, "height": 800 },
      "preferredDockedSize": { "width": 300, "height": 400 },
      "preferredFloatingSize": { "width": 300, "height": 400 }
    }
  ],
  "requiredPermissions": {
    "localFileSystem": "plugin",
    "webview": { "allow": "yes", "domains": [] },
    "network": { "domains": [] }
  },
  "featureFlags": {
    "enableSWCSupport": true
  }
}
```

## Consequences

- Users on PS 25.x or older cannot use the plugin
- Must test on both Windows (Edge WebView2) and macOS (Safari WebView)
- `executeAsModal` required for all pixel access operations (see also
  [ADR-001](001-uxp-over-cep.md)) — **including read-only reads such as
  `imaging.getPixels`**. Photoshop rejects them outside a modal scope with "The
  requested functionality is only allowed from inside a modal scope", regardless
  of the call not mutating the document. Read-only is not an exemption.

  Provenance: observed in Photoshop 27.9.1. Adobe's own docs frame
  `executeAsModal` as needed for operations that _modify_ state and do not
  document this requirement for `getPixels`, so this is an empirical finding,
  not a documented contract. Not re-verified at this ADR's supported floor
  (PS 26.0).
