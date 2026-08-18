import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  BRIDGE_VERSION,
  paletteMessage,
  readyMessage,
  parseBridgeMessage,
  type BridgeMessage,
} from "../bridge/messages";
import { setLogger, type Logger } from "../lib/logger";
import type { DominantColor } from "../algorithms/types";

const aColor = (h: number, weight: number): DominantColor => ({
  rgb: { r: 200, g: 100, b: 50 },
  hsl: { h, s: 60, l: 49 },
  weight,
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
    const message = paletteMessage([aColor(20, 0.5)], 1700000000000);

    expect(message).toEqual({
      type: "palette",
      version: BRIDGE_VERSION,
      payload: { colors: [aColor(20, 0.5)], timestamp: 1700000000000 },
    });
  });

  it("tags a ready message with its type and schema version", () => {
    expect(readyMessage()).toEqual({ type: "ready", version: BRIDGE_VERSION });
  });

  it("round-trips a palette message through JSON unchanged", () => {
    // postMessage across the UXP<->WebView boundary is a structured clone.
    // A payload that survives JSON is plain data — no Map, Set, class instance
    // or method sneaked in — which is the property that clone actually needs.
    const message = paletteMessage([aColor(20, 0.5), aColor(200, 0.5)], 1);

    expect(JSON.parse(JSON.stringify(message))).toEqual(message);
  });

  it("accepts a palette message it produced itself", () => {
    const message = paletteMessage([aColor(20, 1)], 42);

    expect(parseBridgeMessage(JSON.parse(JSON.stringify(message)))).toEqual(
      message,
    );
  });

  it("accepts a ready message it produced itself", () => {
    expect(parseBridgeMessage(readyMessage())).toEqual(readyMessage());
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
    ["an array", [{ type: "palette", version: BRIDGE_VERSION }]],
    ["a message with no type", { version: BRIDGE_VERSION, payload: {} }],
    ["a non-string type", { type: 7, version: BRIDGE_VERSION }],
    ["an unknown type", { type: "harmony", version: BRIDGE_VERSION }],
    ["a message with no version", { type: "ready" }],
    ["a future schema version", { type: "ready", version: BRIDGE_VERSION + 1 }],
    ["a palette with no payload", { type: "palette", version: BRIDGE_VERSION }],
    [
      "a palette whose colors are not an array",
      {
        type: "palette",
        version: BRIDGE_VERSION,
        payload: { colors: "red", timestamp: 1 },
      },
    ],
    [
      "a palette whose color is missing a channel",
      {
        type: "palette",
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
        type: "palette",
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
      { type: "palette", version: BRIDGE_VERSION, payload: { colors: [] } },
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
