import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  BRIDGE_VERSION,
  MAX_PALETTE_COLORS,
  MAX_PICKED_COLORS,
  analysisMessage,
  readyMessage,
  statusMessage,
  visibilityMessage,
  parseBridgeMessage,
  type BridgeMessage,
} from "../bridge/messages";
import { setLogger, type Logger } from "../lib/logger";
import { MAX_DOMINANT_COLORS } from "../algorithms/color-extraction";
import type { DominantColor, HarmonyMatch } from "../algorithms/types";

const aColor = (h: number, weight: number): DominantColor => ({
  rgb: { r: 200, g: 100, b: 50 },
  hsl: { h, s: 60, l: 49 },
  weight,
});

const aHarmony = (nearMiss: HarmonyMatch["nearMiss"] = null): HarmonyMatch => ({
  type: "triadic",
  colorIndices: [0, 1, 2],
  maxDeviation: 7,
  nearMiss,
});

const mockLogger = (): Logger => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

let logger: Logger;

beforeEach(() => {
  logger = mockLogger();
  setLogger(logger);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("bridge message contract", () => {
  it("tags a palette message with its type and schema version", () => {
    const message = analysisMessage([aColor(20, 0.5)], null, [], 1700000000000);

    expect(message).toEqual({
      type: "analysis",
      version: BRIDGE_VERSION,
      payload: {
        colors: [aColor(20, 0.5)],
        harmony: null,
        picked: [],
        timestamp: 1700000000000,
      },
    });
  });

  it("carries the harmony alongside the palette it points into", () => {
    // One message, not two: the harmony names positions *in* the palette, so
    // sent apart the panel could draw a shape through the wrong corners.
    const colors = [aColor(0, 0.4), aColor(120, 0.3), aColor(240, 0.3)];
    const message = analysisMessage(colors, aHarmony(), [], 7);

    expect(message.payload).toEqual({
      colors,
      harmony: aHarmony(),
      picked: [],
      timestamp: 7,
    });
  });

  it("accepts an analysis that reports no harmony", () => {
    expect(parseBridgeMessage(analysisMessage([], null, [], 1))).not.toBeNull();
  });

  it("accepts an analysis carrying a harmony it produced itself", () => {
    const colors = [aColor(0, 0.4), aColor(120, 0.3), aColor(240, 0.3)];
    const message = analysisMessage(colors, aHarmony(), [], 1);

    expect(parseBridgeMessage(JSON.parse(JSON.stringify(message)))).toEqual(
      message,
    );
  });

  it("blames the palette for a malformed palette, not the harmony", () => {
    // Validation order is load-bearing: with the harmony checked first, every
    // malformed-palette case below would be rejected before a color validator
    // ever ran, and the palette rules would be asserted by nothing.
    parseBridgeMessage({
      type: "analysis",
      version: BRIDGE_VERSION,
      payload: { colors: "red", timestamp: 1 },
    });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("palette colors are not a list"),
      expect.anything(),
    );
  });

  it("tags a ready message with its type and schema version", () => {
    expect(readyMessage()).toEqual({ type: "ready", version: BRIDGE_VERSION });
  });

  it("round-trips a palette message through JSON unchanged", () => {
    // postMessage across the UXP<->WebView boundary is a structured clone.
    // A payload that survives JSON is plain data — no Map, Set, class instance
    // or method sneaked in — which is the property that clone actually needs.
    const message = analysisMessage(
      [aColor(20, 0.5), aColor(200, 0.5)],
      null,
      [],
      1,
    );

    expect(JSON.parse(JSON.stringify(message))).toEqual(message);
  });

  it("accepts a palette message it produced itself", () => {
    const message = analysisMessage([aColor(20, 1)], null, [], 42);

    expect(parseBridgeMessage(JSON.parse(JSON.stringify(message)))).toEqual(
      message,
    );
  });

  it("tags a visibility message with its type and schema version", () => {
    expect(visibilityMessage(false)).toEqual({
      type: "visibility",
      version: BRIDGE_VERSION,
      visible: false,
    });
  });

  it.each([true, false])(
    "accepts a visibility message it produced itself (%s)",
    (visible) => {
      expect(parseBridgeMessage(visibilityMessage(visible))).toEqual(
        visibilityMessage(visible),
      );
    },
  );

  // Not coerced: a truthy string here would stop the pipeline for a panel that
  // is on screen, and there is no reading of "yes" that is safe to guess at.
  it.each([
    ["a missing state", { type: "visibility", version: BRIDGE_VERSION }],
    [
      "a string state",
      { type: "visibility", version: BRIDGE_VERSION, visible: "yes" },
    ],
    [
      "a numeric state",
      { type: "visibility", version: BRIDGE_VERSION, visible: 1 },
    ],
    [
      "a null state",
      { type: "visibility", version: BRIDGE_VERSION, visible: null },
    ],
  ])("rejects a visibility message with %s", (_case, raw) => {
    expect(parseBridgeMessage(raw)).toBeNull();
  });

  it("tags a status message with its type and schema version", () => {
    expect(statusMessage("no-document")).toEqual({
      type: "status",
      version: BRIDGE_VERSION,
      state: "no-document",
    });
  });

  it("accepts a status message it produced itself", () => {
    expect(parseBridgeMessage(statusMessage("no-document"))).toEqual(
      statusMessage("no-document"),
    );
  });

  // A state this build cannot name is a message the panel would have to
  // render and could not, so it is refused rather than passed through.
  it.each([
    [
      "an unknown state",
      { type: "status", version: BRIDGE_VERSION, state: "on-fire" },
    ],
    ["no state at all", { type: "status", version: BRIDGE_VERSION }],
    ["a numeric state", { type: "status", version: BRIDGE_VERSION, state: 1 }],
  ])("rejects a status message with %s", (_case, raw) => {
    expect(parseBridgeMessage(raw)).toBeNull();
  });

  it("accepts a ready message it produced itself", () => {
    expect(parseBridgeMessage(readyMessage())).toEqual(readyMessage());
  });

  it("leaves room for every palette the extractor can produce", () => {
    // The two numbers live apart on purpose -- the WebView must not import the
    // quantizer to learn a limit -- so something has to hold them together.
    expect(MAX_PALETTE_COLORS).toBeGreaterThanOrEqual(MAX_DOMINANT_COLORS);
  });

  it("accepts a palette as long as the contract allows", () => {
    const colors = Array.from({ length: MAX_PALETTE_COLORS }, () =>
      aColor(0, 1 / MAX_PALETTE_COLORS),
    );

    expect(
      parseBridgeMessage(analysisMessage(colors, null, [], 1)),
    ).not.toBeNull();
  });

  it("keeps the contents of a rejected message out of the log", () => {
    // A rejected message carries colors read out of the user's image and, being
    // rejected, has no bounded size -- neither half of the log line may repeat
    // it back. The reason for dropping it is the part worth keeping.
    const secret = "x".repeat(500);
    parseBridgeMessage({ type: secret, version: BRIDGE_VERSION });

    const [message, data] = (logger.warn as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, Record<string, unknown>];
    expect(message).not.toContain(secret);
    expect(JSON.stringify(data)).not.toContain(secret);
  });
});

describe("parseBridgeMessage rejects", () => {
  // Each row is a way the WebView can be handed something that is not a
  // message from this schema — including a message from a *later* schema,
  // which is the case that actually shows up as the plugin gains variants.
  const rejected: [name: string, raw: unknown][] = [
    ["undefined", undefined],
    ["null", null],
    ["a string", "palette"],
    ["a number", 42],
    ["an array", [{ type: "analysis", version: BRIDGE_VERSION }]],
    ["a message with no type", { version: BRIDGE_VERSION, payload: {} }],
    ["a non-string type", { type: 7, version: BRIDGE_VERSION }],
    ["an unknown type", { type: "harmony", version: BRIDGE_VERSION }],
    ["a message with no version", { type: "ready" }],
    ["a future schema version", { type: "ready", version: BRIDGE_VERSION + 1 }],
    [
      "a palette with no payload",
      { type: "analysis", version: BRIDGE_VERSION },
    ],
    [
      "a palette longer than the contract allows",
      {
        type: "analysis",
        version: BRIDGE_VERSION,
        payload: {
          colors: Array.from({ length: MAX_PALETTE_COLORS + 1 }, () =>
            aColor(0, 0.1),
          ),
          timestamp: 1,
        },
      },
    ],
    [
      "a palette with holes in it, which every() would skip over",
      {
        type: "analysis",
        version: BRIDGE_VERSION,
        payload: { colors: new Array(3) as unknown[], timestamp: 1 },
      },
    ],
    [
      "a version of NaN, which no comparison rejects on its own",
      { type: "ready", version: Number.NaN },
    ],
    [
      "a color channel of NaN, which would render as nothing",
      {
        type: "analysis",
        version: BRIDGE_VERSION,
        payload: {
          colors: [
            {
              rgb: { r: Number.NaN, g: 2, b: 3 },
              hsl: { h: 0, s: 0, l: 0 },
              weight: 1,
            },
          ],
          timestamp: 1,
        },
      },
    ],
    [
      "an infinite hue, which would place a dot nowhere",
      {
        type: "analysis",
        version: BRIDGE_VERSION,
        payload: {
          colors: [
            {
              rgb: { r: 1, g: 2, b: 3 },
              hsl: { h: Number.POSITIVE_INFINITY, s: 0, l: 0 },
              weight: 1,
            },
          ],
          timestamp: 1,
        },
      },
    ],
    [
      "a palette whose colors are not an array",
      {
        type: "analysis",
        version: BRIDGE_VERSION,
        payload: { colors: "red", timestamp: 1 },
      },
    ],
    [
      "a palette whose color is missing a channel",
      {
        type: "analysis",
        version: BRIDGE_VERSION,
        payload: {
          colors: [
            { rgb: { r: 1, g: 2 }, hsl: { h: 0, s: 0, l: 0 }, weight: 1 },
          ],
          timestamp: 1,
        },
      },
    ],
    [
      "a palette whose weight is not a number",
      {
        type: "analysis",
        version: BRIDGE_VERSION,
        payload: {
          colors: [
            {
              rgb: { r: 1, g: 2, b: 3 },
              hsl: { h: 0, s: 0, l: 0 },
              weight: "heavy",
            },
          ],
          timestamp: 1,
        },
      },
    ],
    [
      "a palette with no timestamp",
      { type: "analysis", version: BRIDGE_VERSION, payload: { colors: [] } },
    ],
    [
      "an analysis that says nothing about harmony at all",
      {
        type: "analysis",
        version: BRIDGE_VERSION,
        payload: { colors: [], timestamp: 1 },
      },
    ],
    [
      "a harmony this build cannot name",
      {
        type: "analysis",
        version: BRIDGE_VERSION,
        payload: {
          colors: [aColor(0, 1)],
          harmony: { type: "pentadic", colorIndices: [0], maxDeviation: 0 },
          timestamp: 1,
        },
      },
    ],
    [
      "a harmony pointing past the end of the palette it arrived with",
      {
        type: "analysis",
        version: BRIDGE_VERSION,
        payload: {
          colors: [aColor(0, 1)],
          harmony: {
            type: "complementary",
            colorIndices: [0, 1],
            maxDeviation: 0,
          },
          timestamp: 1,
        },
      },
    ],
    [
      "a harmony whose position is not a whole number",
      {
        type: "analysis",
        version: BRIDGE_VERSION,
        payload: {
          colors: [aColor(0, 0.5), aColor(180, 0.5)],
          harmony: {
            type: "complementary",
            colorIndices: [0, 1.5],
            maxDeviation: 0,
          },
          timestamp: 1,
        },
      },
    ],
    [
      "a harmony formed by no colors at all",
      {
        type: "analysis",
        version: BRIDGE_VERSION,
        payload: {
          colors: [aColor(0, 1)],
          harmony: { type: "monochromatic", colorIndices: [], maxDeviation: 0 },
          timestamp: 1,
        },
      },
    ],
  ];

  it.each(rejected)("%s, without throwing", (_name, raw) => {
    expect(() => parseBridgeMessage(raw)).not.toThrow();
    expect(parseBridgeMessage(raw)).toBeNull();
  });

  it.each(rejected)("%s, and says so through the logger", (_name, raw) => {
    parseBridgeMessage(raw);

    expect(logger.warn).toHaveBeenCalled();
  });

  it("keeps a rejected message out of the caller's hands", () => {
    const accepted: BridgeMessage[] = [];
    const message = parseBridgeMessage({ type: "harmony", version: 1 });
    if (message) accepted.push(message);

    expect(accepted).toEqual([]);
  });

  it("accepts a harmony the frame only comes close to", () => {
    const harmony = aHarmony({ outlierIndices: [1] });

    expect(
      parseBridgeMessage(
        analysisMessage(
          [aColor(0, 0.4), aColor(120, 0.3), aColor(240, 0.3)],
          harmony,
          [],
          1,
        ),
      ),
    ).toEqual(
      analysisMessage(
        [aColor(0, 0.4), aColor(120, 0.3), aColor(240, 0.3)],
        harmony,
        [],
        1,
      ),
    );
  });

  // The outlier is the color to move, so it has to be one the shape runs
  // through. One outside it points the retoucher at a dot the shape does not
  // touch, which is worse than saying nothing.
  it.each([
    ["an outlier outside the shape", { outlierIndices: [7] }],
    ["a fractional outlier", { outlierIndices: [1.5] }],
    ["no outliers at all", { outlierIndices: [] }],
    ["no outlier field", {}],
    ["an outlier that is not a number", { outlierIndices: ["1"] }],
    ["the same outlier twice", { outlierIndices: [1, 1] }],
  ])("rejects a near miss with %s", (_case, nearMiss) => {
    expect(
      parseBridgeMessage(
        analysisMessage(
          [aColor(0, 0.4), aColor(120, 0.3), aColor(240, 0.3)],
          aHarmony(nearMiss as { outlierIndices: number[] }),
          [],
          1,
        ),
      ),
    ).toBeNull();
  });

  it("rejects a harmony with no near-miss field at all", () => {
    const harmony = { ...aHarmony() } as Partial<HarmonyMatch>;
    delete harmony.nearMiss;

    expect(
      parseBridgeMessage(
        analysisMessage(
          [aColor(0, 0.4), aColor(120, 0.3), aColor(240, 0.3)],
          harmony as HarmonyMatch,
          [],
          1,
        ),
      ),
    ).toBeNull();
  });

  const aPicked = (h: number) => ({
    rgb: { r: 10, g: 20, b: 30 },
    hsl: { h, s: 50, l: 50 },
  });

  it("accepts an analysis carrying the points the user picked", () => {
    const picked = [aPicked(0), aPicked(120)];

    expect(
      parseBridgeMessage(analysisMessage([aColor(0, 1)], null, picked, 1)),
    ).toEqual(analysisMessage([aColor(0, 1)], null, picked, 1));
  });

  // Photoshop allows ten samplers per document; a message claiming more was
  // not produced by the tool this reads, and the panel would draw every one.
  it("refuses more picked colors than the contract allows", () => {
    const picked = Array.from({ length: MAX_PICKED_COLORS + 1 }, (_, at) =>
      aPicked(at * 10),
    );

    expect(
      parseBridgeMessage(analysisMessage([aColor(0, 1)], null, picked, 1)),
    ).toBeNull();
  });

  it.each([
    ["not a list", "several"],
    ["missing", undefined],
  ])("refuses an analysis whose picked colors are %s", (_case, picked) => {
    const message = analysisMessage([aColor(0, 1)], null, [], 1);

    expect(
      parseBridgeMessage({
        ...message,
        payload: { ...message.payload, picked },
      }),
    ).toBeNull();
  });

  it("refuses a picked color with no place on the wheel", () => {
    const message = analysisMessage([aColor(0, 1)], null, [], 1);

    expect(
      parseBridgeMessage({
        ...message,
        payload: {
          ...message.payload,
          picked: [{ rgb: { r: 1, g: 2, b: 3 } }],
        },
      }),
    ).toBeNull();
  });

  // A deviation is an angle on the wheel, and half a turn is as far as two
  // hues can be from each other. Past that the sender is describing something
  // this build has no way to draw.
  it.each([
    ["beyond half a turn", 181],
    ["negative", -1],
  ])("refuses a harmony whose deviation is %s", (_case, maxDeviation) => {
    const colors = [aColor(0, 0.4), aColor(120, 0.3), aColor(240, 0.3)];

    expect(
      parseBridgeMessage(
        analysisMessage(colors, { ...aHarmony(), maxDeviation }, [], 1),
      ),
    ).toBeNull();
  });

  it("refuses a harmony pointing at a color the palette does not have", () => {
    const colors = [aColor(0, 0.4), aColor(120, 0.3), aColor(240, 0.3)];

    expect(
      parseBridgeMessage(
        analysisMessage(
          colors,
          { ...aHarmony(), colorIndices: [0, 1, 9] },
          [],
          1,
        ),
      ),
    ).toBeNull();
  });

  // ADR-009: monochromatic and analogous are span rules, not templates. An arc
  // that is nearly narrow enough is just a wider arc, and there is no vertex to
  // move a color towards -- so a sender claiming one describes a dashed shape
  // the panel cannot draw.
  it.each(["monochromatic", "analogous"])(
    "refuses a near miss on a %s frame",
    (type) => {
      const colors = [aColor(0, 0.5), aColor(8, 0.5)];

      expect(
        parseBridgeMessage(
          analysisMessage(
            colors,
            {
              type: type as HarmonyMatch["type"],
              colorIndices: [0, 1],
              maxDeviation: 4,
              nearMiss: { outlierIndices: [1] },
            },
            [],
            1,
          ),
        ),
      ).toBeNull();
    },
  );
});
