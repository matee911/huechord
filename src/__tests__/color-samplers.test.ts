import { describe, it, expect, vi, beforeEach } from "vitest";

const loggerError = vi.fn();
const loggerWarn = vi.fn();
let activeDocument: unknown;

vi.mock("../globals", () => ({
  photoshop: {
    app: {
      get activeDocument() {
        if (activeDocument === "throw") throw new Error("host not ready");
        return activeDocument;
      },
    },
  },
}));
vi.mock("../lib/logger", () => ({
  logger: {
    error: (...args: unknown[]) => loggerError(...args),
    warn: (...args: unknown[]) => loggerWarn(...args),
  },
}));

const { readPickedColors } = await import("../uxp/color-samplers");
const { MAX_PICKED_COLORS } = await import("../bridge/messages");

const sampler = (red: number, green: number, blue: number) => ({
  color: { rgb: { red, green, blue } },
});

describe("reading the points the user picked", () => {
  beforeEach(() => {
    loggerError.mockReset();
    loggerWarn.mockReset();
    activeDocument = { colorSamplers: [] };
  });

  it("finds nothing when no sampler has been placed", () => {
    expect(readPickedColors()).toEqual([]);
  });

  it("reports each sampler as a color with its place on the wheel", () => {
    activeDocument = { colorSamplers: [sampler(255, 0, 0)] };

    expect(readPickedColors()).toEqual([
      { rgb: { r: 255, g: 0, b: 0 }, hsl: { h: 0, s: 100, l: 50 } },
    ]);
  });

  // Photoshop reports channels as floats, and a hue computed from 254.6 is a
  // hue nobody can point at on the wheel.
  it("rounds the channels the host reports as floats", () => {
    activeDocument = { colorSamplers: [sampler(254.6, 0.4, 0.4)] };

    expect(readPickedColors()[0].rgb).toEqual({ r: 255, g: 0, b: 0 });
  });

  // A sampler over a fully transparent pixel reports NoColor, which has no rgb
  // to read. Drawn anyway it would be a ring at an invented hue.
  it("skips a sampler that is over nothing", () => {
    activeDocument = {
      colorSamplers: [{ color: { typename: "NoColor" } }, sampler(0, 0, 255)],
    };

    const picked = readPickedColors();

    expect(picked).toHaveLength(1);
    expect(picked[0].rgb).toEqual({ r: 0, g: 0, b: 255 });
  });

  it("finds nothing when no document is open", () => {
    activeDocument = undefined;

    expect(readPickedColors()).toEqual([]);
  });

  // The rings are a garnish on the analysis. A host that will not answer costs
  // them, not the palette.
  it("costs the rings and not the palette when the host throws", () => {
    activeDocument = "throw";

    expect(readPickedColors()).toEqual([]);
    expect(loggerError).toHaveBeenCalledWith(
      "Failed to read the picked colors",
      expect.any(Error),
    );
  });

  // The receiver refuses an oversized message whole, so an unexpected eleventh
  // sampler would cost the palette and the harmony, not just the rings.
  it("keeps within what the panel will accept", () => {
    activeDocument = {
      colorSamplers: Array.from({ length: MAX_PICKED_COLORS + 3 }, (_, at) =>
        sampler(at * 10, 0, 0),
      ),
    };

    expect(readPickedColors()).toHaveLength(MAX_PICKED_COLORS);
    expect(loggerWarn).toHaveBeenCalledTimes(1);
  });
});
