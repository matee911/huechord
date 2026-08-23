import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getHarmony,
  getPalette,
  getPaletteReceivedAt,
  getPanelState,
  receiveBridgeMessage,
  subscribeToPalette,
} from "../palette-store";
import {
  analysisMessage,
  readyMessage,
  statusMessage,
} from "../../../src/bridge/messages";
import { setLogger, type Logger } from "../../../src/lib/logger";
import type {
  DominantColor,
  HarmonyMatch,
} from "../../../src/algorithms/types";

const aColor = (h: number): DominantColor => ({
  rgb: { r: 10, g: 20, b: 30 },
  hsl: { h, s: 50, l: 50 },
  weight: 1,
});

const aHarmony = (type: HarmonyMatch["type"]): HarmonyMatch => ({
  type,
  colorIndices: [0],
  maxDeviation: 0,
});

beforeEach(() => {
  const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  setLogger(logger);
  receiveBridgeMessage(analysisMessage([], null, 1));
});

describe("palette store", () => {
  it("replaces the harmony together with the colors it points into", () => {
    receiveBridgeMessage(analysisMessage([aColor(10)], aHarmony("triadic"), 1));
    receiveBridgeMessage(
      analysisMessage([aColor(200)], aHarmony("monochromatic"), 2),
    );

    // Never one without the other: the harmony indexes the palette, so a
    // leftover from the previous edit would draw a shape through the wrong dot.
    expect(getPalette()).toEqual([aColor(200)]);
    expect(getHarmony()).toEqual(aHarmony("monochromatic"));
  });

  it("reports no harmony until an analysis arrives carrying one", () => {
    expect(getHarmony()).toBeNull();
  });

  it("hands the received colors to whoever is subscribed", () => {
    const listener = vi.fn();
    subscribeToPalette(listener);

    receiveBridgeMessage(analysisMessage([aColor(10)], null, 1));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getPalette()).toEqual([aColor(10)]);
  });

  it("stops notifying a listener that unsubscribed", () => {
    const listener = vi.fn();
    subscribeToPalette(listener)();

    receiveBridgeMessage(analysisMessage([aColor(10)], null, 1));

    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps the last good palette when a malformed message arrives", () => {
    // The panel showing stale colors beats the panel going blank because
    // something upstream sent nonsense.
    const listener = vi.fn();
    receiveBridgeMessage(analysisMessage([aColor(10)], null, 1));
    subscribeToPalette(listener);

    expect(() => receiveBridgeMessage({ type: "wat" })).not.toThrow();
    expect(getPalette()).toEqual([aColor(10)]);
    expect(listener).not.toHaveBeenCalled();
  });

  it("ignores a well-formed message that is not a palette", () => {
    const listener = vi.fn();
    subscribeToPalette(listener);

    receiveBridgeMessage(readyMessage());

    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps a snapshot stable between palettes", () => {
    // useSyncExternalStore re-renders whenever the snapshot changes identity,
    // so a fresh array per read would loop the panel forever.
    receiveBridgeMessage(analysisMessage([aColor(10)], null, 1));

    expect(getPalette()).toBe(getPalette());
  });

  it("stamps when a palette arrived, so the render can be timed", () => {
    receiveBridgeMessage(analysisMessage([aColor(10)], null, 1));

    expect(getPaletteReceivedAt()).toBeGreaterThan(0);
  });

  it("remembers a state the host reports", () => {
    receiveBridgeMessage(statusMessage("no-document"));

    expect(getPanelState()).toBe("no-document");
  });

  it("tells its subscribers about a state, not just a palette", () => {
    const listener = vi.fn();
    subscribeToPalette(listener);

    receiveBridgeMessage(statusMessage("no-document"));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  // An analysis is proof a document is open, so it is the one thing that
  // clears the state. There is no separate "never mind" message to lose.
  it("clears the state when an analysis arrives", () => {
    receiveBridgeMessage(statusMessage("no-document"));

    receiveBridgeMessage(analysisMessage([aColor(10)], null, 1));

    expect(getPanelState()).toBeNull();
    expect(getPalette()).toHaveLength(1);
  });

  it("keeps the last palette when a state arrives after it", () => {
    receiveBridgeMessage(analysisMessage([aColor(10)], null, 1));

    receiveBridgeMessage(statusMessage("no-document"));

    expect(getPanelState()).toBe("no-document");
    expect(getPalette()).toHaveLength(1);
  });
});
