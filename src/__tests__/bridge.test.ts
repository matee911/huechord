import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  BRIDGE_VERSION,
  MAX_PALETTE_COLORS,
  analysisMessage,
  readyMessage,
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

const aHarmony = (): HarmonyMatch => ({
  type: "triadic",
  colorIndices: [0, 1, 2],
  maxDeviation: 7,
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
    const message = analysisMessage([aColor(20, 0.5)], null, 1700000000000);

    expect(message).toEqual({
      type: "analysis",
      version: BRIDGE_VERSION,
      payload: {
        colors: [aColor(20, 0.5)],
        harmony: null,
        timestamp: 1700000000000,
      },
    });
  });

  it("carries the harmony alongside the palette it points into", () => {
    // One message, not two: the harmony names positions *in* the palette, so
    // sent apart the panel could draw a shape through the wrong corners.
    const colors = [aColor(0, 0.4), aColor(120, 0.3), aColor(240, 0.3)];
    const message = analysisMessage(colors, aHarmony(), 7);

    expect(message.payload).toEqual({
      colors,
      harmony: aHarmony(),
      timestamp: 7,
    });
  });

  it("accepts an analysis that reports no harmony", () => {
    expect(parseBridgeMessage(analysisMessage([], null, 1))).not.toBeNull();
  });

  it("accepts an analysis carrying a harmony it produced itself", () => {
    const colors = [aColor(0, 0.4), aColor(120, 0.3), aColor(240, 0.3)];
    const message = analysisMessage(colors, aHarmony(), 1);

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
      1,
    );

    expect(JSON.parse(JSON.stringify(message))).toEqual(message);
  });

  it("accepts a palette message it produced itself", () => {
    const message = analysisMessage([aColor(20, 1)], null, 42);

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

    expect(parseBridgeMessage(analysisMessage(colors, null, 1))).not.toBeNull();
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
});
