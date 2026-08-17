# ADR-006: Use Manifest v6 and apiVersion 2

**Status**: Accepted
**Date**: 2026-08-17
**Supersedes**: [ADR-005](005-manifest-and-api-version.md)
**Amended**: 2026-08-17 — the Photoshop floor moved out to [ADR-007](007-photoshop-floor.md), which is a separate decision and was never named in this ADR's title

## Context

[ADR-005](005-manifest-and-api-version.md) decided manifest v5 with apiVersion 2, targeting PS 26.0+. The code has always shipped `manifestVersion: 6` (`uxp.config.ts`), so the accepted decision and the artifact disagreed, and nothing recorded why. The same pattern produced the modal-scope defect fixed in #11, where a documented consequence was treated as optional.

ADR-005 was also internally inconsistent before it met the code: manifest v5's floor is PS 23.3.0, but ADR-005 targets PS 26.0+, so v5 bought reach the same decision declined to use.

## Options

**Lower the code to v5.** Restores agreement with ADR-005 and puts the project on a documented manifest version. Costs re-verification that the WebView entrypoint and permissions still work, and gains nothing the project wants — the reach v5 buys is below the floor already chosen.

**Adopt v6 and supersede ADR-005.** Records what ships and what has been observed to work. Costs one new ADR, and accepts that v6's own requirements are undocumented (see Risks).

**Amend ADR-005 in place.** Rejected: its title and Decision both name v5, so editing it would erase the fact that the decision changed.

## Decision

Use **manifest v6** with **apiVersion 2**. The minimum Photoshop version is a separate decision — see [ADR-007](007-photoshop-floor.md).

## Rationale

- v6 is what the build emits and what runs. Verified 2026-08-17: the plugin loaded through UDT into Photoshop 27.9.1, rendered its WebView panel, and completed a full pixel-acquisition cycle.
- Nothing in the codebase requires v5 _rather than_ v6. The WebView permission block that [ADR-002](002-webview-for-ui.md) calls for was introduced in v5 and works unchanged under v6 — v5 is a floor for that feature, not a pin.
- Lowering to v5 would mean changing a working artifact to match a document, which is the wrong direction when the document is the thing that was never true.

## Risks

**Manifest v6's host requirements are undocumented.** Adobe's public UXP manifest documentation stops at v5; no source states which Photoshop version v6 requires, and `vite-uxp-plugin` types the field as a bare `number`, so nothing validates it.

The practical consequence lands on the Photoshop floor, which is set independently of the manifest version: a floor below v6's real requirement ships a plugin that fails to load, with no error explaining why. That is handled in [ADR-007](007-photoshop-floor.md).

## Consequences

- The PS floor is set by `host[0].minVersion` in `uxp.config.ts`, not by the manifest version. The manifest version only bounds what is possible — see [ADR-007](007-photoshop-floor.md).
- `executeAsModal` is required for all pixel access operations, **including read-only reads such as `imaging.getPixels`**. Photoshop rejects them outside a modal scope with "The requested functionality is only allowed from inside a modal scope", regardless of the call not mutating the document. Read-only is not an exemption. Observed in PS 27.9.1; Adobe's docs frame `executeAsModal` as being for state-modifying operations and do not document this, so it is an empirical finding rather than a documented contract, and it is not re-verified at the declared floor.
- Must test on both Windows (Edge WebView2) and macOS (Safari WebView).
- The manifest version, apiVersion and host floor are pinned by `src/__tests__/uxp-config.test.ts`, so changing them fails the suite and forces a revisit of this ADR rather than drifting silently.

The manifest is generated from `uxp.config.ts` by `vite-uxp-plugin`; that file holds the shipped values. This ADR deliberately does not reproduce them — a hand-copied skeleton is how ADR-005 drifted in the first place.
