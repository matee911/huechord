# ADR-009: A Frame Can Be Close To A Harmony

**Status**: Accepted
**Date**: 2026-08-24
**Supersedes**: [ADR-008](008-harmony-detection.md)

## Context

ADR-008 settled that the result is a harmony or nothing, and it was right about the thing it was arguing against: a percentage puts random input in the middle of the range, and the middle of a range reads as a partial answer.

But "a harmony or nothing" collapses two situations a retoucher needs to tell apart. A frame whose three strongest colors sit at 0°, 135° and 250° is fifteen degrees of one slider from a triad. A frame at 12°, 88°, 133°, 196°, 271° and 338° is not near anything. Both are told "No harmony in this frame", and the first one is exactly the moment the plugin was supposed to help with — the grade is nearly there and the panel stays silent about it.

ADR-008 anticipated this: it records that the plugin "cannot yet say «move this hue by 15° and it is a triad»" and that the data for it is already computed. `matchTemplate` knows how far each color sits from its arm, and it throws that away when the worst of them exceeds the tolerance.

## Decision

**A frame can be close to a harmony, and the panel says which color is out of place.**

Three rules, and the third is what keeps ADR-008's argument intact:

1. **A second, wider tolerance.** A template that fits inside `TOLERANCE_DEGREES` is a harmony, as before. One that only fits inside twice that is a near miss. Past it there is nothing.

   Twice, rather than a number of its own, because the deviation being measured is already half the spread of the misses: for a two-armed shape a deviation of 20° means the two colors are 40° apart from where they should be, and past that the eye is not looking at a stretched complementary any more. Tying the second threshold to the first also means there is one number to argue about instead of two.

2. **A near miss names the color to move.** The match already computes each color's signed miss; the one furthest from the middle of them is the one whose movement would close the shape. That index travels with the match, and the panel marks that dot.

3. **Still no number.** Not a percentage, and not "move by 15°" either. The percentage was rejected because a mid-range number reads as a partial answer; a degree count is a different kind of claim, but it invites the retoucher to trust a precision the pipeline does not have — the hue it would be measured against is a quantizer's cluster average over a downsampled frame. The shape drawn dashed, through the dots, with the offending one marked, says what is true without pretending to a decimal place.

Exact matches are always preferred: the near-miss pass runs only when no template fits inside the ordinary tolerance, so a clean complementary is never reported as a near-miss triad.

Monochromatic and analogous stay exact-only. They are span rules rather than templates — an arc that is "nearly narrow enough" is just a wider arc, and there is no vertex to move a color towards.

## Consequences

- `HarmonyMatch` carries `nearMiss: { outlierIndex } | null`. The two states are one field rather than a boolean plus an index, so "a near miss with no outlier" cannot be represented.
- `BRIDGE_VERSION` goes from 2 to 3. A receiver from before this change reads a near miss as a firm harmony and draws it solid — the exact misreading the bump exists to prevent.
- The decision table from Step 4 is unchanged for everything that matched before. Only frames that previously reported nothing can now report a near miss, so nothing that was a harmony becomes one of these.
- A frame with no color relationship still claims nothing, which was ADR-008's core requirement and remains the case this is tested against.

## Alternatives considered

**Leave it as ADR-008 has it.** Cheapest, and it keeps the panel honest — but it leaves the plugin silent at the one moment it has something useful to say, and the data is already in hand.

**A confidence score after all, now that there are two thresholds.** Rejected for ADR-008's original reason, which has not weakened: a number in the middle of a range reads as a partial answer no matter how it is computed.

**Report the near miss as a harmony with a flag the panel may ignore.** Rejected: a flag a receiver is free to ignore is a contract that lies to any receiver that does. The version bump makes it explicit instead.
