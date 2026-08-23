# ADR-009: A Frame Can Be Close To A Harmony

**Status**: Accepted
**Date**: 2026-08-24
**Supersedes**: [ADR-008](008-harmony-detection.md)

## Context

ADR-008 settled that the result is a harmony or nothing, and it was right about the thing it was arguing against: a percentage puts random input in the middle of the range, and the middle of a range reads as a partial answer.

But "a harmony or nothing" collapses two situations a retoucher needs to tell apart. A frame whose three strongest colors sit at 0°, 132° and 228° misses a triad by twelve degrees. A frame at 12°, 88°, 133°, 196°, 271° and 338° is not near anything. Both are told "No harmony in this frame", and the first one is exactly the moment the plugin was supposed to help with — the grade is nearly there and the panel stays silent about it.

(0°, 135° and 250° would be the more obvious illustration and is the wrong one: the template slides, so that frame already matches a triad exactly, at a deviation of 7.5°. It is worth stating because the difference between "one color is 15° off its arm" and "the shape as a whole cannot be placed within 10° of these colors" is the whole subject.)

ADR-008 anticipated this: it records that the plugin "cannot yet say «move this hue by 15° and it is a triad»" and that the data for it is already computed. `matchTemplate` knows how far each color sits from its arm, and it throws that away when the worst of them exceeds the tolerance.

## Decision

**A frame can be close to a harmony, and the panel says which color is out of place.**

Three rules, and the third is what keeps ADR-008's argument intact:

1. **A second, wider tolerance, bounded by what the search can actually reach.** A template that fits inside `TOLERANCE_DEGREES` (10°) is a harmony, as before. One that only fits inside `MIN_ARM_GAP / 4` (15°) is a near miss. Past it there is nothing.

   The instinct is to say "twice the tolerance", and that is wrong in a way worth writing down. Pairing a color to an arm has to reach twice the limit, because a shape whose worst color is `d` off can have raw misses spanning `2d`. But it must never reach more than half the gap between two arms, or a color falls in range of both and which arm claims it comes down to iteration order. The narrowest gap in these templates is 60°, so the reach is capped at 30°, and a limit above 15° would be a promise the search cannot keep — the extra band would exist in the constant and nowhere else.

   So the number is derived from the arm gap rather than from the tolerance. It lands at one and a half times the tolerance, which is a coincidence of the templates, not the rule.

2. **A near miss names the colors to move.** The match already computes each color's signed miss; those furthest from the median of them are the ones whose movement would close the shape. Measured from the median rather than from the middle of the range, because with two colors on their arms and one well off it every miss is the same distance from the midpoint and the odd one out disappears.

   Plural, and that matters. In a two-armed shape both colors are always equally displaced and moving either one closes it; three colors can tie the same way. Naming one of them would make the answer depend on the order the extractor emitted the palette in, which is not a fact about the photograph. Every color that far out is named, and the panel marks all of them.

3. **Still no number.** Not a percentage, and not "move by 15°" either. The percentage was rejected because a mid-range number reads as a partial answer; a degree count is a different kind of claim, but it invites the retoucher to trust a precision the pipeline does not have — the hue it would be measured against is a quantizer's cluster average over a downsampled frame. The shape drawn dashed, through the dots, with the offending one marked, says what is true without pretending to a decimal place.

Exact matches are always preferred: the near-miss pass runs only when no template fits inside the ordinary tolerance, so a clean complementary is never reported as a near-miss triad.

Monochromatic and analogous stay exact-only. They are span rules rather than templates — an arc that is "nearly narrow enough" is just a wider arc, and there is no vertex to move a color towards.

## Consequences

- `HarmonyMatch` carries `nearMiss: { outlierIndices } | null`. The two states are one field rather than a boolean plus a list, so "a near miss with nothing out of place" cannot be represented. The receiver refuses an empty list for the same reason.
- The receiver also refuses a near miss on a monochromatic or analogous match, because rule 3 below says those cannot have one and a contract that only the sender honours is not a contract.
- `BRIDGE_VERSION` goes from 2 to 3. A receiver from before this change reads a near miss as a firm harmony and draws it solid — the exact misreading the bump exists to prevent.
- The decision table from Step 4 is unchanged for everything that matched before. Only frames that previously reported nothing can now report a near miss, so nothing that was a harmony becomes one of these.
- A frame with no color relationship still claims nothing, which was ADR-008's core requirement and remains the case this is tested against.

## Alternatives considered

**Leave it as ADR-008 has it.** Cheapest, and it keeps the panel honest — but it leaves the plugin silent at the one moment it has something useful to say, and the data is already in hand.

**A confidence score after all, now that there are two thresholds.** Rejected for ADR-008's original reason, which has not weakened: a number in the middle of a range reads as a partial answer no matter how it is computed.

**Take the issue's own example — hues 0, 120, 240 and 55 — as the definition of a near miss.** Rejected: those first three already form a perfect triad, so reporting the frame as "close" would hedge an answer that is not in doubt, and that is the regression the same issue asks to avoid. What makes a frame close is that no template fits it exactly, not that it has a color left over.

**Report the near miss as a harmony with a flag the panel may ignore.** Rejected: a flag a receiver is free to ignore is a contract that lies to any receiver that does. The version bump makes it explicit instead.
