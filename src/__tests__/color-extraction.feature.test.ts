import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { extractDominantColors } from "../algorithms/color-extraction";
import type { DominantColor, RGBColor } from "../algorithms/types";

const feature = await loadFeature("src/__tests__/color-extraction.feature");

const OPAQUE = 255;
const CHANNELS = 4;

/** Packs RGBA tuples into the interleaved buffer shape `getPixels` produces. */
const bufferOf = (pixels: number[][]): Uint8ClampedArray =>
  Uint8ClampedArray.from(pixels.flat());

const uniform = (
  count: number,
  [r, g, b]: number[],
  alpha = OPAQUE,
): number[][] => Array.from({ length: count }, () => [r, g, b, alpha]);

/**
 * A deterministic stand-in for a photograph: several distinct color regions,
 * each dithered into many near-neighbours the way real tonal variation is. A
 * seeded generator rather than Math.random, so a failure is reproducible.
 */
const photographLike = (count: number): number[][] => {
  const regions = [
    [180, 40, 35],
    [30, 90, 160],
    [240, 220, 190],
    [60, 120, 55],
    [200, 150, 40],
    [90, 40, 110],
  ];

  let seed = 20260818;
  const jitter = (span: number): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return (seed % span) - Math.floor(span / 2);
  };

  return Array.from({ length: count }, (_, index) => {
    const [r, g, b] = regions[index % regions.length];
    return [r + jitter(12), g + jitter(12), b + jitter(12), OPAQUE];
  });
};

const expectCloseToRgb = (actual: RGBColor, [r, g, b]: number[]): void => {
  // MMCQ reports each cluster's average, and the buffers below are dithered,
  // so an exact match would be asserting more than the algorithm promises.
  expect(actual.r).toBeCloseTo(r, -1);
  expect(actual.g).toBeCloseTo(g, -1);
  expect(actual.b).toBeCloseTo(b, -1);
};

describeFeature(feature, ({ Scenario }) => {
  let buffer: Uint8ClampedArray;
  let palette: DominantColor[];
  let durationMs: number;

  const extract = (): void => {
    const start = performance.now();
    palette = extractDominantColors(buffer, CHANNELS);
    durationMs = performance.now() - start;
  };

  Scenario("Single-color image", ({ Given, When, Then, And }) => {
    Given("a buffer of 400 pixels where every pixel is 200, 30, 60", () => {
      buffer = bufferOf(uniform(400, [200, 30, 60]));
    });

    When("dominant colors are extracted", extract);

    Then("exactly 1 dominant color is returned", () => {
      expect(palette).toHaveLength(1);
    });

    And("the first color is approximately 200, 30, 60", () => {
      expectCloseToRgb(palette[0].rgb, [200, 30, 60]);
    });

    And("its weight is approximately 1.0", () => {
      expect(palette[0].weight).toBeCloseTo(1, 2);
    });
  });

  Scenario("Two-color split image", ({ Given, When, Then, And }) => {
    Given(
      "a buffer of 400 pixels split evenly between 255, 0, 0 and 0, 0, 255",
      () => {
        buffer = bufferOf([
          ...uniform(200, [255, 0, 0]),
          ...uniform(200, [0, 0, 255]),
        ]);
      },
    );

    When("dominant colors are extracted", extract);

    Then("exactly 2 dominant colors are returned", () => {
      expect(palette).toHaveLength(2);
    });

    And("every weight is approximately 0.5", () => {
      for (const { weight } of palette) expect(weight).toBeCloseTo(0.5, 2);
    });
  });

  Scenario(
    "Weights describe how much of the image each color covers",
    ({ Given, When, Then }) => {
      Given(
        "a buffer of 400 pixels that is three quarters 255, 0, 0 and one quarter 0, 0, 255",
        () => {
          buffer = bufferOf([
            ...uniform(300, [255, 0, 0]),
            ...uniform(100, [0, 0, 255]),
          ]);
        },
      );

      When("dominant colors are extracted", extract);

      Then("the weights are approximately 0.75 and 0.25 in that order", () => {
        expect(palette.map(({ weight }) => weight)).toHaveLength(2);
        expect(palette[0].weight).toBeCloseTo(0.75, 2);
        expect(palette[1].weight).toBeCloseTo(0.25, 2);
      });
    },
  );

  Scenario("Real-world-like image", ({ Given, When, Then, And }) => {
    Given(
      "a buffer of 10000 pixels drawn from more than 100 distinct colors",
      () => {
        const pixels = photographLike(10000);
        const distinct = new Set(pixels.map(([r, g, b]) => `${r},${g},${b}`));
        expect(distinct.size).toBeGreaterThan(100);
        buffer = bufferOf(pixels);
      },
    );

    When("dominant colors are extracted", extract);

    Then("between 5 and 8 dominant colors are returned", () => {
      expect(palette.length).toBeGreaterThanOrEqual(5);
      expect(palette.length).toBeLessThanOrEqual(8);
    });

    And("they are sorted by descending weight", () => {
      const weights = palette.map(({ weight }) => weight);
      expect(weights).toEqual([...weights].sort((a, b) => b - a));
    });

    And("every color carries rgb, hsl and a weight", () => {
      for (const color of palette) {
        expect(color.rgb).toEqual({
          r: expect.any(Number),
          g: expect.any(Number),
          b: expect.any(Number),
        });
        expect(color.hsl).toEqual({
          h: expect.any(Number),
          s: expect.any(Number),
          l: expect.any(Number),
        });
        expect(color.weight).toBeGreaterThan(0);
      }
    });

    And("the weights sum to approximately 1.0", () => {
      const total = palette.reduce((sum, { weight }) => sum + weight, 0);
      expect(total).toBeCloseTo(1, 5);
    });
  });

  Scenario(
    "Fully transparent pixels are ignored",
    ({ Given, When, Then, And }) => {
      Given(
        "a buffer of 400 pixels split evenly between opaque 0, 255, 0 and fully transparent 255, 0, 0",
        () => {
          buffer = bufferOf([
            ...uniform(200, [0, 255, 0]),
            ...uniform(200, [255, 0, 0], 0),
          ]);
        },
      );

      When("dominant colors are extracted", extract);

      Then("exactly 1 dominant color is returned", () => {
        expect(palette).toHaveLength(1);
      });

      And("the first color is approximately 0, 255, 0", () => {
        expectCloseToRgb(palette[0].rgb, [0, 255, 0]);
      });

      And("its weight is approximately 1.0", () => {
        expect(palette[0].weight).toBeCloseTo(1, 2);
      });
    },
  );

  // getPixels returns the flattened composite, so layer opacity has already
  // been resolved into the samples. These two cases pin what that leaves the
  // algorithm looking at, which is not obvious from the buffer alone.
  Scenario(
    "A half-transparent layer over an opaque one",
    ({ Given, When, Then, And }) => {
      Given(
        "a buffer of 400 opaque pixels that are 128, 0, 128, the blend a half-transparent 255, 0, 0 layer makes over an opaque 0, 0, 255 one",
        () => {
          buffer = bufferOf(uniform(400, [128, 0, 128]));
        },
      );

      When("dominant colors are extracted", extract);

      Then("exactly 1 dominant color is returned", () => {
        expect(palette).toHaveLength(1);
      });

      And("the first color is approximately 128, 0, 128", () => {
        expectCloseToRgb(palette[0].rgb, [128, 0, 128]);
      });

      And("its weight is approximately 1.0", () => {
        expect(palette[0].weight).toBeCloseTo(1, 2);
      });
    },
  );

  Scenario(
    "A half-transparent layer over nothing",
    ({ Given, When, Then, And }) => {
      Given(
        "a buffer of 400 pixels split evenly between opaque 0, 255, 0 and half-transparent 255, 0, 0",
        () => {
          buffer = bufferOf([
            ...uniform(200, [0, 255, 0]),
            ...uniform(200, [255, 0, 0], 128),
          ]);
        },
      );

      When("dominant colors are extracted", extract);

      Then("exactly 2 dominant colors are returned", () => {
        expect(palette).toHaveLength(2);
      });

      // Half-transparent pixels count once, same as opaque ones: there is no
      // second color underneath to dilute them, so what the retoucher sees is
      // the layer's own color at reduced strength -- still that color.
      And("every weight is approximately 0.5", () => {
        for (const { weight } of palette) expect(weight).toBeCloseTo(0.5, 2);
      });
    },
  );

  // imageData.components is 3 for an RGB document and 4 for RGBA, so both are
  // values the host really produces -- the alpha-free path cannot be assumed
  // dead just because the test buffers above all carry four channels.
  Scenario(
    "A buffer without an alpha channel",
    ({ Given, When, Then, And }) => {
      Given(
        "a three-channel buffer of 400 pixels that is three quarters 255, 0, 0 and one quarter 0, 0, 255",
        () => {
          buffer = Uint8ClampedArray.from(
            [
              ...Array.from({ length: 300 }, () => [255, 0, 0]),
              ...Array.from({ length: 100 }, () => [0, 0, 255]),
            ].flat(),
          );
        },
      );

      When("dominant colors are extracted from three-channel data", () => {
        palette = extractDominantColors(buffer, 3);
      });

      Then("exactly 2 dominant colors are returned", () => {
        expect(palette).toHaveLength(2);
      });

      And("the weights are approximately 0.75 and 0.25 in that order", () => {
        expect(palette[0].weight).toBeCloseTo(0.75, 2);
        expect(palette[1].weight).toBeCloseTo(0.25, 2);
      });
    },
  );

  Scenario("Nothing left to quantize", ({ Given, When, Then }) => {
    Given("a buffer of 400 pixels that are all fully transparent", () => {
      buffer = bufferOf(uniform(400, [120, 200, 40], 0));
    });

    When("dominant colors are extracted", extract);

    Then("an empty palette is returned", () => {
      expect(palette).toEqual([]);
    });
  });

  // A frame with nothing in it is the case a quantizer is most likely to answer
  // strangely -- one cluster, no clusters, or a division by a zero population.
  Scenario("An all-black frame", ({ Given, When, Then, And }) => {
    Given("a buffer of 400 pixels that are all 0, 0, 0", () => {
      buffer = bufferOf(uniform(400, [0, 0, 0]));
    });

    When("dominant colors are extracted", extract);

    Then("exactly 1 dominant color is returned", () => {
      expect(palette).toHaveLength(1);
    });

    // Not exactly zero: the quantizer reports a cluster average, which lands a
    // few units off its inputs. What matters is that the frame reads as black.
    And("the only color is as dark as the frame and covers all of it", () => {
      expect(palette[0].hsl.l).toBeLessThan(5);
      expect(palette[0].weight).toBeCloseTo(1);
    });
  });

  Scenario("An all-white frame", ({ Given, When, Then, And }) => {
    Given("a buffer of 400 pixels that are all 255, 255, 255", () => {
      buffer = bufferOf(uniform(400, [255, 255, 255]));
    });

    When("dominant colors are extracted", extract);

    Then("exactly 1 dominant color is returned", () => {
      expect(palette).toHaveLength(1);
    });

    And("the only color is as light as the frame and covers all of it", () => {
      expect(palette[0].hsl.l).toBeGreaterThan(95);
      expect(palette[0].weight).toBeCloseTo(1);
    });

    // The cluster average for an all-white frame comes back as 256 on a
    // channel, which is not a color -- the panel would render `rgb(256, …)`
    // and the contract would wave it through as a finite number.
    And("no channel is outside the range a color can take", () => {
      for (const value of Object.values(palette[0].rgb)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(255);
      }
    });
  });

  // Gray has no hue to report, and the conversion has to say so rather than
  // land on an arbitrary angle that the wheel would then draw a dot at.
  Scenario("A grayscale frame", ({ Given, When, Then }) => {
    Given(
      "a buffer of 400 pixels stepping through eight shades of gray",
      () => {
        buffer = bufferOf(
          Array.from({ length: 8 }, (_, step) =>
            uniform(50, [step * 32, step * 32, step * 32]),
          ).flat(),
        );
      },
    );

    When("dominant colors are extracted", extract);

    Then("every color returned has no saturation", () => {
      expect(palette.length).toBeGreaterThan(0);
      for (const { hsl } of palette) expect(hsl.s).toBe(0);
    });
  });

  Scenario(
    "Extraction stays inside the frame budget",
    ({ Given, When, Then }) => {
      Given(
        "a buffer of 10000 pixels drawn from more than 100 distinct colors",
        () => {
          buffer = bufferOf(photographLike(10000));
        },
      );

      When("dominant colors are extracted", extract);

      Then("extraction completed in under 50 milliseconds", () => {
        expect(durationMs).toBeLessThan(50);
      });
    },
  );
});
