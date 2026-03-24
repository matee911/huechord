# ADR-001: Use UXP over CEP for Plugin Platform

**Status**: Accepted
**Date**: 2025-02-25

## Context

Photoshop supports multiple extensibility platforms: UXP, CEP, ExtendScript, C++ SDK.

## Decision

Use **UXP** (Unified Extensibility Platform) as the plugin platform.

## Rationale

- CEP is deprecated (CEP 12 is final, security patches only)
- ExtendScript is deprecated (ES3, no pixel access, no panel UI)
- C++ SDK has no panel UI capability
- UXP is Adobe's actively developed standard with Imaging API, event listeners, WebView support
- All new Photoshop API features are UXP-only

## Consequences

- Must work within UXP's limited HTML/CSS subset (mitigated by WebView — see [ADR-002](002-webview-for-ui.md))
- Requires `executeAsModal` for pixel access (apiVersion 2)
- Plugin requires PS 23.3.0+ minimum
