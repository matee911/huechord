# ADR-006: Use Manifest v6

**Status**: Accepted
**Date**: 2026-08-17
**Supersedes**: [ADR-005](005-manifest-and-api-version.md)

## Context

[ADR-005](005-manifest-and-api-version.md) decided manifest v5 with apiVersion 2, targeting PS 26.0+. The code has always shipped `manifestVersion: 6` (`uxp.config.ts`), so the accepted decision and the artifact disagreed, and nothing recorded why.

That is worse than a stale number. This repo treats ADRs as authoritative — the modal-scope defect fixed in #11 happened because a consequence documented in ADR-001 and ADR-005 was treated as optional. One ADR known to be wrong about the code makes every other ADR advisory.

ADR-005 was also internally inconsistent, independent of the code. Manifest v5's floor is PS 23.3.0, but ADR-005 targets PS 26.0+ — so v5 bought backward compatibility that the same decision explicitly declined to use.

## Options

**Lower the code to v5.** Restores agreement with ADR-005, but gives up whatever v6 provides for compatibility with hosts the project already decided not to support. Would need re-verification that the WebView entrypoint still works.

**Adopt v6 and supersede ADR-005.** Records what actually ships and works. Costs one new ADR and leaves 005 in history as a superseded decision, which is what the ADR mechanism is for.

**Amend ADR-005 in place.** Rejected: its title is "Use Manifest v5" and its Decision section names v5. Editing that is not an amendment, it is a rewrite disguised as one — and it would erase the fact that the decision ever changed.

## Decision

Use **manifest v6** with **apiVersion 2**, targeting **PS 26.0+** (Photoshop 2025).

## Rationale

- v6 is what the build emits and what runs. Verified 2026-08-17: the plugin loaded through UDT into Photoshop 27.9.1 and completed a full acquisition cycle.
- Nothing in the codebase depends on v5-specific behaviour, so the change costs nothing to adopt.
- v5's advantage over v6 is reach down to PS 23.3.0, and ADR-005 already declined that reach by setting the floor at 26.0. Keeping v5 bought nothing this project wanted.
- Everything ADR-005 justified — apiVersion 2, the PS 26.0 floor, WebView and Spectrum support — is unaffected by the manifest version and carries over unchanged.

## Consequences

- Users on PS 25.x or older cannot use the plugin. Unchanged from ADR-005; restated because ADR-001's "PS 23.3.0+ minimum" traced to manifest v5's floor and no longer applies.
- `executeAsModal` is required for all pixel access operations, **including read-only reads such as `imaging.getPixels`** — Photoshop rejects them outside a modal scope regardless of the call not mutating the document. Observed in PS 27.9.1; Adobe's docs frame `executeAsModal` as being for state-modifying operations and do not document this, so it is an empirical finding rather than a documented contract, and it is not re-verified at the PS 26.0 floor. Carried over from ADR-005.
- Must test on both Windows (Edge WebView2) and macOS (Safari WebView).
- The manifest version is pinned by a test, so changing it fails the suite and forces a revisit of this ADR rather than a silent drift.

## Manifest Skeleton

```json
{
  "manifestVersion": 6,
  "id": "com.colors.harmony-wheel",
  "name": "Color Harmony Wheel",
  "version": "1.0.0",
  "main": "index.html",
  "host": [
    {
      "app": "PS",
      "minVersion": "26.0.0",
      "data": { "apiVersion": 2 }
    }
  ]
}
```

Generated from `uxp.config.ts` by `vite-uxp-plugin`; the file above is illustrative, not a second source of truth.
