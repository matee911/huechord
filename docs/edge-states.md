# Edge states: what the panel says when there is nothing to analyze

## TL;DR

- With no document open the panel says so, instead of showing the palette of a document that was
  closed ten minutes ago and a stack trace every five seconds.
- The host is not asked for pixels at all when there is no document, which removes both the error
  and the modal scope.
- Near-black and near-white colors stop steering harmony detection. Their hue is an artifact of
  rounding, and a black that quantizes to hue 240 was voting on whether a frame is complementary.
- The palette keeps them. They are really in the image, and the bar is a picture of the image, not
  of the harmony.

## Why the two halves are one change

The plan's Step 5 groups them, and they share a premise: the panel currently answers every state
with the same screen. "No document", "a document with nothing worth calling a color", and "not
analyzed yet" all render as an empty wheel with `Open a document and start editing` under it. One
of those three is a lie in each of the other two cases.

## Responsibilities

| Module                            | Gains                                                              | Why there                                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/uxp/document-state.ts` (new) | `hasOpenDocument()`                                                | One host read, so the pipeline can decide before entering a modal scope. Separate from `imaging.ts` because it asks a question rather than doing work. |
| `src/bridge/messages.ts`          | `status` message with one state                                    | The panel cannot infer "no document" from an empty palette — an all-transparent document also has no colors. It has to be told.                        |
| `src/uxp/palette-publisher.ts`    | Publishes a status the same way it publishes an analysis           | Both are "the newest thing the panel should be showing"; a second buffer would let them arrive out of order.                                           |
| `src/uxp/pixel-pipeline.ts`       | Reports the state instead of acquiring                             | It already owns "what happens on a tick".                                                                                                              |
| `webview-ui/src/palette-store.ts` | Holds the state, cleared by any analysis                           | An analysis is proof a document exists; nothing else needs to clear it.                                                                                |
| `src/algorithms/harmony.ts`       | A lightness floor and ceiling beside the existing saturation floor | `candidates()` is already the one place that decides which colors get a vote.                                                                          |

`BRIDGE_VERSION` is not bumped: a new `type` needs none, and no existing variant changes shape.

## What "no document" replaces

Before, a tick with no open document went all the way into `executeAsModal`, failed there, and wrote
`Pixel acquisition failed` with a stack trace to the console — every five seconds, for as long as
the panel stayed open. The check costs one property read and removes the whole path.

## Near-black and near-white

`candidates()` already drops colors below `SATURATION_FLOOR` and below `MIN_SHARE`. Lightness is a
separate axis and neither of those catches it: `rgb(10, 0, 0)` has saturation 100 and lightness 2,
so a shadow votes with the same weight as a real red.

| Color                        | L   | Today            | After                                     |
| ---------------------------- | --- | ---------------- | ----------------------------------------- |
| `rgb(10,0,0)` shadow         | 2%  | votes on harmony | ignored by detection, kept in the palette |
| `rgb(250,250,255)` highlight | 99% | votes on harmony | ignored by detection, kept in the palette |
| `rgb(200,40,40)` red         | 47% | votes            | votes                                     |

Filtered in detection rather than in extraction, because the palette bar is a picture of the image:
a photograph that is two-thirds shadow should show two-thirds shadow, whatever the wheel makes of it.

## Non-RGB documents

Nothing to add. `imaging.ts` already asks for `colorSpace: "RGB"` and `componentSize: 8`, so the host
converts a CMYK or Lab document on the way out and the extractor never sees another color model.
This is a claim about the host, not about our code, so it is on the manual-test list rather than in
a unit test.

## Interfaces

- **UI**: one new message in the panel, in the place the count already occupies.
- **CLI / code**: `parseBridgeMessage` gains a variant.

## Spec

```gherkin
Scenario: No document open
  Given no document is open
  When the pipeline runs
  Then no pixels are acquired
  And the panel is told there is no document

Scenario: A document is opened
  Given the panel is showing that there is no document
  When an analysis arrives
  Then the panel shows the palette instead

Scenario: A shadow does not vote on harmony
  Given dominant colors at hues 0, 120 and 240 and a near-black at hue 55
  When harmony detection runs
  Then the frame is reported as triadic
  And the near-black is not one of its colors
```

## Acceptance criteria

- [ ] With no document open the panel says so, and the console stays quiet
- [ ] Opening a document replaces the message with a palette, with no reload
- [ ] Near-black and near-white colors do not appear in a harmony's colors
- [ ] They do still appear in the palette and in the bar
- [ ] `color-extraction.feature` covers all-black, all-white and grayscale input
- [ ] `yarn verify` passes
