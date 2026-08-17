# ADR-007: Set the Photoshop Floor at 27.0

**Status**: Accepted
**Date**: 2026-08-17
**Supersedes**: the minimum-Photoshop-version part of
[ADR-006](006-manifest-v6.md) (PS 26.0+), and the same consequence as stated in
[ADR-005](005-manifest-and-api-version.md) (PS 26.0+) and
[ADR-001](001-uxp-over-cep.md) (PS 23.3.0+). Those ADRs are left exactly as
written — this one is the current answer.

## Context

The minimum supported Photoshop version is `host[0].minVersion` in `uxp.config.ts` — a setting independent of the manifest version, which only bounds what is possible. [ADR-006](006-manifest-v6.md) folded the floor into its own decision, which conflated the two; this ADR separates them and takes the floor over. ADR-006's title names only the manifest version and apiVersion, so the floor was never the part it was written to hold.

The floor inherited from [ADR-005](005-manifest-and-api-version.md) was PS 26.0. Nobody ever loaded the plugin on it. [ADR-006](006-manifest-v6.md) also established that manifest v6's own host requirement is undocumented by Adobe, so a 26.0 floor was a claim that could not be checked against anything.

Earlier still, [ADR-001](001-uxp-over-cep.md) states PS 23.3.0+. That number matches manifest v5's floor exactly and nothing in ADR-001 explains it, so it appears to have been carried over rather than decided there. It is left in place: ADR-001 decided UXP over CEP, that decision stands, and editing a past record to correct a number it never owned would be rewriting history to save a reader one link.

## Options

**Keep 26.0 and verify it.** Requires installing an old Photoshop through Creative Cloud's "other versions" and loading a v6 build on it. Buys reach the project has no known demand for.

**Raise to 27.0.** Matches the generation actually in use. Gives up hypothetical users below it, removes an unverifiable claim.

**Raise to 27.9.1** — the exact version tested. Maximally honest, but excludes the rest of the 27.x line for no observed reason, and 27.9.1 is a patch release nobody would recognise as a requirement.

## Decision

Set `host[0].minVersion` to **27.0.0** (Photoshop 2026).

## Rationale

- PS 27 is the generation in use; there are no known users below it, so the reach given up is hypothetical while the removed risk is not.
- A floor nobody has tested is the same category of claim as an ADR nobody checked against the code — the failure this repo has spent a day removing.
- 27.0 keeps the requirement expressible as a release ("Photoshop 2026") rather than a patch number, which is what a user reads before installing.

## Consequences

- Users on PS 26.x or older cannot use the plugin. Deliberate, not incidental.
- **Residual gap: 27.0 through 27.9 is declared but not exercised.** The plugin has been verified on 27.9.1 only. One generation wide and low-risk, but recorded rather than assumed — assuming it is how ADR-005 got into the state that prompted all of this. Close it opportunistically: the next time a PS 27.x below 27.9.1 is at hand, load a build and note the result here.
- The floor is pinned by `src/__tests__/uxp-config.test.ts`, so changing it fails the suite and forces a revisit of this ADR.
- Raising the floor again supersedes this ADR rather than editing it — see the ADR rules in [CONTRIBUTING.md](../../CONTRIBUTING.md).
