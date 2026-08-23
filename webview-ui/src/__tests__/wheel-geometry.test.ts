import { describe, it, expect } from "vitest";
import {
  cssColor,
  dotPosition,
  dotRadius,
  harmonyLabel,
  harmonyShape,
  swatchWidths,
} from "../wheel-geometry";
import type { DominantColor } from "../../../src/algorithms/types";

const color = (weight: number): DominantColor => ({
  rgb: { r: 1, g: 2, b: 3 },
  hsl: { h: 0, s: 0, l: 0 },
  weight,
});

const closeTo = (point: { x: number; y: number }) => ({
  x: expect.closeTo(point.x, 6) as number,
  y: expect.closeTo(point.y, 6) as number,
});

describe("dotPosition", () => {
  it("puts hue 0 straight up", () => {
    expect(dotPosition(0, 100, 100)).toEqual(closeTo({ x: 0, y: -100 }));
  });

  it("runs hue clockwise", () => {
    expect(dotPosition(90, 100, 100)).toEqual(closeTo({ x: 100, y: 0 }));
    expect(dotPosition(180, 100, 100)).toEqual(closeTo({ x: 0, y: 100 }));
    expect(dotPosition(270, 100, 100)).toEqual(closeTo({ x: -100, y: 0 }));
  });

  it("wraps a full turn back onto itself", () => {
    expect(dotPosition(360, 100, 100)).toEqual(
      closeTo(dotPosition(0, 100, 100)),
    );
  });

  it("puts a fully desaturated color in the center whatever its hue", () => {
    expect(dotPosition(210, 0, 100)).toEqual(closeTo({ x: 0, y: 0 }));
  });

  it("scales distance with saturation", () => {
    expect(dotPosition(0, 50, 100)).toEqual(closeTo({ x: 0, y: -50 }));
  });

  it("keeps an out-of-range saturation inside the wheel", () => {
    // The extractor produces 0-100, but a dot escaping the rim would be a
    // rendering artifact nobody could explain from the image.
    expect(dotPosition(0, 140, 100)).toEqual(closeTo({ x: 0, y: -100 }));
    expect(dotPosition(0, -20, 100)).toEqual(closeTo({ x: 0, y: 0 }));
  });
});

describe("dotRadius", () => {
  it("gives a trace color the minimum size", () => {
    expect(dotRadius(0, 3, 12)).toBe(3);
  });

  it("gives a color covering the whole image the maximum size", () => {
    expect(dotRadius(1, 3, 12)).toBe(12);
  });

  it("scales area rather than radius with weight", () => {
    // Half the image should read as half the ink: area doubles when weight
    // doubles, which means the radius grows by sqrt(2), not by 2.
    const area = (weight: number) => Math.PI * dotRadius(weight, 0, 10) ** 2;

    expect(area(0.5) / area(0.25)).toBeCloseTo(2, 6);
  });

  it("clamps a weight outside 0-1", () => {
    expect(dotRadius(4, 3, 12)).toBe(12);
    expect(dotRadius(-1, 3, 12)).toBe(3);
  });
});

describe("swatchWidths", () => {
  it("gives each color a share proportional to its weight", () => {
    expect(swatchWidths([color(0.75), color(0.25)])).toEqual([75, 25]);
  });

  it("always fills the bar exactly", () => {
    const widths = swatchWidths([color(0.2), color(0.3), color(0.1)]);

    expect(widths.reduce((sum, width) => sum + width, 0)).toBeCloseTo(100, 6);
  });

  it("splits the bar evenly when every weight is zero", () => {
    expect(swatchWidths([color(0), color(0)])).toEqual([50, 50]);
  });

  it("has nothing to divide for an empty palette", () => {
    expect(swatchWidths([])).toEqual([]);
  });
});

describe("harmonyLabel", () => {
  it("names the harmony that was found", () => {
    expect(
      harmonyLabel({
        type: "triadic",
        colorIndices: [],
        maxDeviation: 0,
        nearMiss: null,
      }),
    ).toBe("Triadic");
  });

  it("keeps a hyphenated harmony readable", () => {
    expect(
      harmonyLabel({
        type: "split-complementary",
        colorIndices: [],
        maxDeviation: 0,
        nearMiss: null,
      }),
    ).toBe("Split-complementary");
  });

  // "Close to" and no number: the dashed shape and the marked dot say which
  // way to move without claiming a precision the pipeline does not have.
  it("says a frame is only close when the shape does not quite hold", () => {
    expect(
      harmonyLabel({
        type: "triadic",
        colorIndices: [0, 1, 2],
        maxDeviation: 14,
        nearMiss: { outlierIndices: [2] },
      }),
    ).toBe("Close to triadic");
  });

  it("keeps a hyphenated harmony readable when it is only close", () => {
    expect(
      harmonyLabel({
        type: "split-complementary",
        colorIndices: [0, 1, 2],
        maxDeviation: 14,
        nearMiss: { outlierIndices: [1] },
      }),
    ).toBe("Close to split complementary");
  });

  it("says a monochromatic palette is one hue, since nothing is drawn", () => {
    expect(
      harmonyLabel({
        type: "monochromatic",
        colorIndices: [0, 1],
        maxDeviation: 4,
        nearMiss: null,
      }),
    ).toBe("Monochromatic — one hue");
  });

  it("says so when the frame shows none", () => {
    expect(harmonyLabel(null)).toBe("No harmony in this frame");
  });
});

describe("harmonyShape", () => {
  const at = (h: number): DominantColor => ({
    rgb: { r: 0, g: 0, b: 0 },
    hsl: { h, s: 100, l: 50 },
    weight: 0.5,
  });

  it("puts a vertex on each dot the harmony names, in its order", () => {
    // The shape has to run through the dots the panel already drew, so the
    // vertices come from the same placement rule rather than a second opinion.
    const colors = [at(0), at(90), at(180)];
    const points = harmonyShape(
      colors,
      {
        type: "complementary",
        colorIndices: [2, 0],
        maxDeviation: 0,
        nearMiss: null,
      },
      100,
    );

    expect(points).toHaveLength(2);
    expect(points?.[0].y).toBeCloseTo(100, 5);
    expect(points?.[1].y).toBeCloseTo(-100, 5);
  });

  it("draws nothing for a monochromatic palette", () => {
    // It names every eligible color, so a length check alone would draw a
    // triangle through three dots a few degrees apart -- which says nothing
    // the dots do not already say, and reads as a harmony that is not one.
    expect(
      harmonyShape(
        [at(0), at(8), at(16)],
        {
          type: "monochromatic",
          colorIndices: [0, 1, 2],
          maxDeviation: 8,
          nearMiss: null,
        },
        100,
      ),
    ).toBeNull();
  });

  it("draws nothing when there is no harmony", () => {
    expect(harmonyShape([at(0)], null, 100)).toBeNull();
  });
});

describe("cssColor", () => {
  it("renders channels as an rgb triple", () => {
    expect(cssColor({ r: 12, g: 34, b: 56 })).toBe("rgb(12, 34, 56)");
  });

  it("rounds the quantizer's fractional averages", () => {
    expect(cssColor({ r: 12.4, g: 34.5, b: 56.6 })).toBe("rgb(12, 35, 57)");
  });
});
