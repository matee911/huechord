import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getPalette,
  receiveBridgeMessage,
  subscribeToPalette,
} from "../palette-store";
import { paletteMessage, readyMessage } from "../../../src/bridge/messages";
import { setLogger, type Logger } from "../../../src/lib/logger";
import type { DominantColor } from "../../../src/algorithms/types";

const aColor = (h: number): DominantColor => ({
  rgb: { r: 10, g: 20, b: 30 },
  hsl: { h, s: 50, l: 50 },
  weight: 1,
});

beforeEach(() => {
  const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  setLogger(logger);
  receiveBridgeMessage(paletteMessage([], 1));
});

describe("palette store", () => {
  it("hands the received colors to whoever is subscribed", () => {
    const listener = vi.fn();
    subscribeToPalette(listener);

    receiveBridgeMessage(paletteMessage([aColor(10)], 1));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getPalette()).toEqual([aColor(10)]);
  });

  it("stops notifying a listener that unsubscribed", () => {
    const listener = vi.fn();
    subscribeToPalette(listener)();

    receiveBridgeMessage(paletteMessage([aColor(10)], 1));

    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps the last good palette when a malformed message arrives", () => {
    // The panel showing stale colors beats the panel going blank because
    // something upstream sent nonsense.
    const listener = vi.fn();
    receiveBridgeMessage(paletteMessage([aColor(10)], 1));
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
    receiveBridgeMessage(paletteMessage([aColor(10)], 1));

    expect(getPalette()).toBe(getPalette());
  });
});
