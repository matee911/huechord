# ADR-008: Harmony Is Detected, Not Scored

**Status**: Superseded by [ADR-009](009-near-miss-harmony.md)
**Date**: 2026-08-18

## Context

The plugin tells a retoucher how their grading relates to the classical color harmonies. `docs/implementation-plan.md` describes this as a "match percentage" — the closest harmony and how close it is.

A percentage turns out to be the wrong answer to the wrong question. Any formula that maps angular error onto 0–100% puts random input somewhere in the middle of the range, because the expected error of random hues is about half the worst possible error. So a photograph with no color relationship at all reads as "Complementary — 58%", and 58% looks like a partial answer rather than what it is: no answer. That is worse than saying nothing — it invites grading towards a harmony the image was never near.

A photograph either shows a harmony or it does not. What a retoucher wants to know is which, and — when it does — which colors form it.

## Decision

**The result is a harmony or nothing.** No score.

Angular distance is the documented formula, no approximation:

```
angDist(a, b) = min(|a - b|, 360 - |a - b|)
```

Harmonies come in two shapes, and the rule differs because the thing being recognized differs.

**The geometric ones — complementary, split-complementary, triadic, tetradic, square** — are a template of hue offsets. One is reported when **there are exactly as many eligible colors as arms and some placement of the template puts each arm on a distinct color within the tolerance**. The template may sit anywhere on the wheel — it is not anchored with an arm exactly on one of the colors. Of the templates the palette is the right size for, the one that fits tightest wins.

**The arc ones — monochromatic and analogous** — are not shapes but neighbourhoods, so they are decided from how wide an arc the eligible colors occupy. Fixing them as offsets would mean picking a color count and a spacing, and a run of four hues 20° apart is as analogous as three at 30°.

| Constant         | Value               | Meaning                                                        |
| ---------------- | ------------------- | -------------------------------------------------------------- |
| Tolerance        | **±10°**            | How far a color may sit from an ideal position and still count |
| Minimum share    | **5%** of the image | How much of the frame a color must cover to take part          |
| Saturation floor | **10%**             | Below it a hue is numerical noise, not a color                 |

Geometric templates, tried richest first, the first fit winning:

| Harmony             | Offsets         |
| ------------------- | --------------- |
| square              | 0, 90, 180, 270 |
| tetradic            | 0, 60, 180, 240 |
| triadic             | 0, 120, 240     |
| split-complementary | 0, 150, 210     |
| complementary       | 0, 180          |

The arc is found by locating the widest empty gap on the wheel; what is left over is the arc, and the color just past the gap starts it. That also gives the order the panel connects them in — the way the eye travels the wheel.

The result names the harmony and **which colors in the palette form it**, in the order the shape connects them, so the panel can draw the shape through dots it is already showing.

## Rationale

**±10° rather than tighter or looser.** Grading is done by eye and lands near a hue, not on it, so a harmony nobody can hit is a harmony nobody can use. At ±20° almost any palette of three or more colors matches something, and the panel is back to saying something regardless — this time in lines instead of percentages.

**5% minimum share** answers the case raised in review: a color covering 2% of the frame should not close a triad the frame does not show. With a yes/no answer this matters more than it did with a score, because that speck decides whether anything is drawn at all. It cuts both ways — a trace color also cannot break a harmony the rest of the palette forms.

**The colors that count are the harmony — as many as the template has arms, no more.** This is the rule that makes the answer mean something. Without it the question becomes "do some of these colors happen to line up", which any handful of scattered hues answers yes to: six random hues reliably contain a near split-complementary triple. It also stops the panel drawing a shape that leaves a dominant dot untouched, which reads as a detection error. The cost is a strict reading — one qualifying color off the shape and the answer is no.

**Nothing depends on the order the extractor emits colors in.** The extractor sorts by weight, so a reweighting of the same colors must not flip the answer. Two places had to be built for that: the arc is measured from the widest gap rather than from whichever color came first, and a template reports its tightest rotation rather than its first.

**Tightest fit wins.** Requiring the palette to be exactly the size of the template already rules out naming a corner of a bigger shape — four colors are never described as a complementary pair. What is left to decide is only between templates of the same width, and there the answer is which one the colors actually sit on.

**The template is not anchored on a color.** Placing an arm exactly on one dominant color and measuring the rest from there makes the answer jump: a palette nudged a degree can lose a harmony that a worse-fitting one keeps, because a different color becomes the anchor. Letting the template slide means the deviation reported is the real one — half the spread between the largest miss each way — and it is the number a future "shift this hue" feature would consume.

**Arcs before shapes.** A palette inside a 60° arc is a neighbourhood, and no geometric template packs its arms that tightly — the closest pair of arms anywhere in the table, split-complementary's 150° and 210°, is 60° apart. Checking the arcs first is what keeps a tight cluster from being described as a distorted shape.

**No score at all, rather than a score plus a threshold.** A threshold would be a tuning constant on top of a number the user is still shown and still reads as a measurement. The tolerance is the same constant expressed where it belongs — in degrees on the wheel, which is the unit the question is actually asked in.

## Consequences

- The panel is silent on most photographs. That is the intended behavior, not a gap: most photographs are not built on a color harmony.
- Dominant colors are always drawn on the wheel regardless — the harmony only adds lines through them.
- Adding a harmony is a row in the template table plus a name in `HarmonyType`, which the bridge's size table and the template list both consume — both are exhaustive over that union, so an omission is a compile error rather than a harmony the panel silently never shows. Tetradic and square, listed as Future Scope in the implementation plan, are in from the start on those terms.
- Because the template slides, the tolerance bounds how far each color is from its _ideal_ position, not how far the palette is from a textbook spacing. Two colors 160° apart are a complementary pair with both 10° out; 159° apart is nothing. A shape stretched so its colors miss in opposite directions fails even when each miss is small.
- Nothing reports _how close_ a near-miss is, so the plugin cannot yet say "shift this hue 15° for a triad". The data is there — `maxDeviation` and the template — if that becomes a feature.
- A palette with more eligible colors than any template has arms — five or more — can only be monochromatic or analogous. A frame with five separate colors each covering 5% of it and each properly saturated is not built on a classical harmony, so this is a consequence rather than a gap.
- The strictness is a knob with real cost in the other direction: an orange/teal frame with a red accent above 5% reports nothing, though a retoucher would call it complementary. If that proves too strict in use, the rule to relax is "every eligible color on the shape", not the tolerance.
