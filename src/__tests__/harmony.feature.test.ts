import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { detectHarmony } from "../algorithms/harmony";
import type { DominantColor, HarmonyMatch } from "../algorithms/types";

const feature = await loadFeature("src/__tests__/harmony.feature");

const SATURATED = 80;

/**
 * A palette reduced to what detection actually reads: the hue, how saturated
 * it is and how much of the image it covers. The rgb triplet is required by
 * the type and never looked at here, so it stays a constant rather than
 * pretending to be derived from the hue.
 */
const paletteOf = (
  hues: number[],
  weights?: number[],
  saturation = SATURATED,
): DominantColor[] =>
  hues.map((h, index) => ({
    rgb: { r: 0, g: 0, b: 0 },
    hsl: { h, s: saturation, l: 50 },
    weight: weights ? weights[index] : 1 / hues.length,
  }));

/**
 * The same palette, plus one color pinned at an extreme of the lightness axis.
 * Saturation stays high on purpose: that is the whole point -- a shadow can be
 * fully saturated, so the saturation floor never sees it.
 */
const paletteWithExtreme = (
  hues: number[],
  extremeHue: number,
  lightness: number,
): DominantColor[] => [
  ...paletteOf(hues),
  {
    rgb: { r: 0, g: 0, b: 0 },
    hsl: { h: extremeHue, s: SATURATED, l: lightness },
    weight: 1 / (hues.length + 1),
  },
];

describeFeature(feature, ({ Scenario }) => {
  let palette: DominantColor[];
  let harmony: HarmonyMatch | null;
  let durationMs: number;

  const detect = (): void => {
    const start = performance.now();
    harmony = detectHarmony(palette);
    durationMs = performance.now() - start;
  };

  const givenHues =
    (hues: number[], weights?: number[], saturation?: number) => () => {
      palette = paletteOf(hues, weights, saturation);
    };

  Scenario("Complementary harmony detected", ({ Given, When, Then, And }) => {
    Given("dominant colors at hues 0 and 180", givenHues([0, 180]));
    When("harmony detection runs", detect);
    Then("the harmony is complementary", () => {
      expect(harmony?.type).toBe("complementary");
    });
    // The panel draws the shape through the dots it already has, so the match
    // has to say which dots -- naming the harmony alone would leave it guessing.
    And("it is formed by the colors at positions 0 and 1", () => {
      expect(harmony?.colorIndices).toEqual([0, 1]);
    });
  });

  Scenario("Grading by eye still counts", ({ Given, When, Then }) => {
    Given("dominant colors at hues 0 and 172", givenHues([0, 172]));
    When("harmony detection runs", detect);
    Then("the harmony is complementary", () => {
      expect(harmony?.type).toBe("complementary");
    });
  });

  Scenario(
    "The shape may sit anywhere on the wheel",
    ({ Given, When, Then }) => {
      // Neither color is on an ideal position, but both are inside the
      // tolerance of one placement -- the axis sits between their misses
      // rather than on top of either.
      Given("dominant colors at hues 0 and 165", givenHues([0, 165]));
      When("harmony detection runs", detect);
      Then("the harmony is complementary", () => {
        expect(harmony?.type).toBe("complementary");
      });
    },
  );

  Scenario(
    "Past the tolerance there is no harmony",
    ({ Given, When, Then }) => {
      Given("dominant colors at hues 0 and 159", givenHues([0, 159]));
      When("harmony detection runs", detect);
      Then("no harmony is reported", () => {
        expect(harmony).toBeNull();
      });
    },
  );

  Scenario(
    "The template that fits tightest is the one reported",
    ({ Given, When, Then }) => {
      // These four also fit a square, and a square is the wider shape -- but
      // it fits worse, and how well a shape fits is the whole question.
      Given(
        "dominant colors at hues 0, 71, 180 and 251",
        givenHues([0, 71, 180, 251]),
      );
      When("harmony detection runs", detect);
      Then("the harmony is tetradic", () => {
        expect(harmony?.type).toBe("tetradic");
      });
    },
  );

  Scenario(
    "A shape stretched out of proportion is not that shape",
    ({ Given, When, Then }) => {
      // Each of these is close enough to a split-complementary arm to be paired
      // with one, but they miss in opposite directions -- no placement of the
      // shape brings all three inside the tolerance at once.
      Given("dominant colors at hues 0, 132 and 228", givenHues([0, 132, 228]));
      When("harmony detection runs", detect);
      Then("no harmony is reported", () => {
        expect(harmony).toBeNull();
      });
    },
  );

  Scenario("Triadic harmony detected", ({ Given, When, Then, And }) => {
    Given("dominant colors at hues 0, 120 and 240", givenHues([0, 120, 240]));
    When("harmony detection runs", detect);
    Then("the harmony is triadic", () => {
      expect(harmony?.type).toBe("triadic");
    });
    And("it is formed by 3 colors", () => {
      expect(harmony?.colorIndices).toHaveLength(3);
    });
  });

  Scenario("Split-complementary harmony detected", ({ Given, When, Then }) => {
    Given("dominant colors at hues 0, 150 and 210", givenHues([0, 150, 210]));
    When("harmony detection runs", detect);
    Then("the harmony is split-complementary", () => {
      expect(harmony?.type).toBe("split-complementary");
    });
  });

  Scenario("Analogous harmony detected", ({ Given, When, Then }) => {
    Given("dominant colors at hues 30, 58 and 88", givenHues([30, 58, 88]));
    When("harmony detection runs", detect);
    Then("the harmony is analogous", () => {
      expect(harmony?.type).toBe("analogous");
    });
  });

  Scenario(
    "Neighbouring hues at any spacing are analogous",
    ({ Given, When, Then }) => {
      // Fifteen degrees apart is as analogous as thirty. A fixed template of
      // offsets would have to pick one spacing and miss the other.
      Given("dominant colors at hues 20, 35 and 50", givenHues([20, 35, 50]));
      When("harmony detection runs", detect);
      Then("the harmony is analogous", () => {
        expect(harmony?.type).toBe("analogous");
      });
    },
  );

  Scenario("Two neighbouring hues are analogous", ({ Given, When, Then }) => {
    Given("dominant colors at hues 30 and 60", givenHues([30, 60]));
    When("harmony detection runs", detect);
    Then("the harmony is analogous", () => {
      expect(harmony?.type).toBe("analogous");
    });
  });

  Scenario(
    "An analogous run across the 360 boundary",
    ({ Given, When, Then, And }) => {
      Given("dominant colors at hues 350, 10 and 20", givenHues([350, 10, 20]));
      When("harmony detection runs", detect);
      Then("the harmony is analogous", () => {
        expect(harmony?.type).toBe("analogous");
      });
      // The panel connects them the way the eye travels the wheel. Sorting by
      // raw hue would start the run at 10 and leave 350 dangling at the end.
      And("it connects the colors in the order they sit along the arc", () => {
        expect(harmony?.colorIndices).toEqual([0, 1, 2]);
      });
    },
  );

  Scenario(
    "Past the arc they stop being neighbours",
    ({ Given, When, Then }) => {
      Given("dominant colors at hues 0 and 70", givenHues([0, 70]));
      When("harmony detection runs", detect);
      Then("no harmony is reported", () => {
        expect(harmony).toBeNull();
      });
    },
  );

  Scenario("Square harmony detected", ({ Given, When, Then, And }) => {
    Given(
      "dominant colors at hues 0, 90, 180 and 270",
      givenHues([0, 90, 180, 270]),
    );
    When("harmony detection runs", detect);
    // Four colors on a square also hold two complementary pairs. Reporting the
    // pair would be naming a corner of what is on the wheel.
    Then("the harmony is square", () => {
      expect(harmony?.type).toBe("square");
    });
    And("it is formed by 4 colors", () => {
      expect(harmony?.colorIndices).toHaveLength(4);
    });
  });

  Scenario("Tetradic harmony detected", ({ Given, When, Then }) => {
    Given(
      "dominant colors at hues 0, 60, 180 and 240",
      givenHues([0, 60, 180, 240]),
    );
    When("harmony detection runs", detect);
    Then("the harmony is tetradic", () => {
      expect(harmony?.type).toBe("tetradic");
    });
  });

  Scenario(
    "A color the shape does not reach makes the answer no",
    ({ Given, When, Then }) => {
      Given(
        "dominant colors at hues 0, 9, 18 and 180",
        givenHues([0, 9, 18, 180]),
      );
      When("harmony detection runs", detect);
      // Two of these sit inside the same arm's window. Counting them as
      // explained and drawing the segment through only one would leave two
      // dominant dots on the wheel that no line touches.
      Then("no harmony is reported", () => {
        expect(harmony).toBeNull();
      });
    },
  );

  Scenario(
    "A color off the shape makes the answer no",
    ({ Given, When, Then }) => {
      Given(
        "dominant colors at hues 0, 120, 240 and 55",
        givenHues([0, 120, 240, 55]),
      );
      When("harmony detection runs", detect);
      // Without this rule the question becomes "do some of these colors happen
      // to line up", which any handful of scattered hues answers yes to.
      Then("no harmony is reported", () => {
        expect(harmony).toBeNull();
      });
    },
  );

  Scenario(
    "Hues either side of the 360 boundary are one hue, not opposites",
    ({ Given, When, Then }) => {
      Given("dominant colors at hues 359 and 1", givenHues([359, 1]));
      When("harmony detection runs", detect);
      // A naive |a - b| reads these as 358 degrees apart, which is very nearly
      // a complementary pair. They are two degrees apart.
      Then("the harmony is monochromatic", () => {
        expect(harmony?.type).toBe("monochromatic");
      });
    },
  );

  Scenario(
    "A trace color neither completes a harmony nor breaks one",
    ({ Given, When, Then, And }) => {
      Given(
        "a palette of hue 0 at weight 0.48, hue 180 at weight 0.48 and hue 90 at weight 0.04",
        givenHues([0, 180, 90], [0.48, 0.48, 0.04]),
      );
      When("harmony detection runs", detect);
      Then("the harmony is complementary", () => {
        expect(harmony?.type).toBe("complementary");
      });
      And("it is formed by 2 colors", () => {
        expect(harmony?.colorIndices).toHaveLength(2);
      });
    },
  );

  Scenario("A gray carries no hue to place", ({ Given, When, Then }) => {
    Given(
      "dominant colors at hues 0 and 180, and a third at hue 90 with 3 percent saturation",
      () => {
        palette = [
          ...paletteOf([0, 180]),
          {
            rgb: { r: 0, g: 0, b: 0 },
            hsl: { h: 90, s: 3, l: 50 },
            weight: 0.5,
          },
        ];
      },
    );
    When("harmony detection runs", detect);
    Then("the harmony is complementary", () => {
      expect(harmony?.type).toBe("complementary");
    });
  });

  Scenario(
    "A desaturated palette shows no harmony",
    ({ Given, When, Then }) => {
      Given(
        "dominant colors at hues 0, 120 and 240, all at 4 percent saturation",
        givenHues([0, 120, 240], undefined, 4),
      );
      When("harmony detection runs", detect);
      Then("no harmony is reported", () => {
        expect(harmony).toBeNull();
      });
    },
  );

  Scenario(
    "A cluster of near-identical hues is one hue",
    ({ Given, When, Then }) => {
      Given("dominant colors at hues 0, 8 and 16", givenHues([0, 8, 16]));
      When("harmony detection runs", detect);
      Then("the harmony is monochromatic", () => {
        expect(harmony?.type).toBe("monochromatic");
      });
    },
  );

  Scenario(
    "The order the colors arrive in does not change the answer",
    ({ Given, When, Then }) => {
      // The extractor orders by weight, so a reweighting of the same three
      // colors must not flip the panel between naming a harmony and not.
      Given("dominant colors at hues 16, 8 and 0", givenHues([16, 8, 0]));
      When("harmony detection runs", detect);
      Then("the harmony is monochromatic", () => {
        expect(harmony?.type).toBe("monochromatic");
      });
    },
  );

  Scenario(
    "A single dominant color is monochromatic",
    ({ Given, When, Then }) => {
      Given("dominant colors at hues 210", givenHues([210]));
      When("harmony detection runs", detect);
      Then("the harmony is monochromatic", () => {
        expect(harmony?.type).toBe("monochromatic");
      });
    },
  );

  Scenario("Scattered hues show no harmony", ({ Given, When, Then }) => {
    Given(
      "dominant colors at hues 12, 88, 133, 196, 271 and 338",
      givenHues([12, 88, 133, 196, 271, 338]),
    );
    When("harmony detection runs", detect);
    Then("no harmony is reported", () => {
      expect(harmony).toBeNull();
    });
  });

  Scenario("An empty palette shows no harmony", ({ Given, When, Then }) => {
    Given("an empty palette", givenHues([]));
    When("harmony detection runs", detect);
    Then("no harmony is reported", () => {
      expect(harmony).toBeNull();
    });
  });

  // A shadow's hue is an artifact of rounding, and it is fully saturated, so
  // the saturation floor lets it through to vote on the shape.
  Scenario(
    "A shadow does not vote on harmony",
    ({ Given, When, Then, And }) => {
      Given(
        "dominant colors at hues 0, 120 and 240 plus a near-black at hue 55",
        () => {
          palette = paletteWithExtreme([0, 120, 240], 55, 2);
        },
      );
      When("harmony detection runs", detect);
      Then("the harmony is triadic", () => {
        expect(harmony?.type).toBe("triadic");
      });
      And("it is formed by 3 colors", () => {
        expect(harmony?.colorIndices).toHaveLength(3);
        expect(harmony?.colorIndices).not.toContain(3);
      });
    },
  );

  Scenario(
    "A blown highlight does not vote either",
    ({ Given, When, Then, And }) => {
      Given(
        "dominant colors at hues 0, 120 and 240 plus a near-white at hue 55",
        () => {
          palette = paletteWithExtreme([0, 120, 240], 55, 98);
        },
      );
      When("harmony detection runs", detect);
      Then("the harmony is triadic", () => {
        expect(harmony?.type).toBe("triadic");
      });
      And("it is formed by 3 colors", () => {
        expect(harmony?.colorIndices).toHaveLength(3);
        expect(harmony?.colorIndices).not.toContain(3);
      });
    },
  );

  Scenario(
    "Detection stays inside the frame budget",
    ({ Given, When, Then }) => {
      Given(
        "dominant colors at hues 12, 88, 133, 196, 271 and 338",
        givenHues([12, 88, 133, 196, 271, 338]),
      );
      When("harmony detection runs", detect);
      Then("detection completed in under 5 milliseconds", () => {
        expect(durationMs).toBeLessThan(5);
      });
    },
  );
});
