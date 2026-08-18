import { describe, it, expect } from "vitest";
import type {
  RGBColor,
  HSLColor,
  Palette,
  HarmonyMatch,
} from "../algorithms/types";

describe("types", () => {
  it("RGBColor is structurally valid", () => {
    const color: RGBColor = { r: 255, g: 128, b: 0 };
    expect(color.r).toBe(255);
    expect(color.g).toBe(128);
    expect(color.b).toBe(0);
  });

  it("HSLColor is structurally valid", () => {
    const color: HSLColor = { h: 180, s: 50, l: 75 };
    expect(color.h).toBe(180);
  });

  it("Palette holds DominantColors", () => {
    const palette: Palette = {
      colors: [
        {
          rgb: { r: 255, g: 0, b: 0 },
          hsl: { h: 0, s: 100, l: 50 },
          weight: 0.6,
        },
      ],
      timestamp: Date.now(),
    };
    expect(palette.colors).toHaveLength(1);
    expect(palette.colors[0].weight).toBe(0.6);
  });

  it("HarmonyMatch has expected shape", () => {
    const match: HarmonyMatch = {
      type: "triadic",
      colorIndices: [0, 2, 3],
      maxDeviation: 7,
    };
    expect(match.type).toBe("triadic");
    expect(match.colorIndices).toHaveLength(3);
  });
});
