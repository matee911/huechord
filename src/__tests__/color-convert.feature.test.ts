import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { hslToRgb, rgbToHsl } from "../algorithms/color-convert";
import type { HSLColor, RGBColor } from "../algorithms/types";

const feature = await loadFeature("src/__tests__/color-convert.feature");

// Examples tables arrive as strings; every scenario below needs them as numbers.
const num = (value: string): number => Number(value);

describeFeature(feature, ({ Scenario, ScenarioOutline }) => {
  ScenarioOutline(
    "Convert a known RGB color to HSL",
    ({ Given, When, Then }, variables) => {
      let rgb: RGBColor;
      let hsl: HSLColor;

      Given("the RGB color <r>, <g>, <b>", () => {
        rgb = { r: num(variables.r), g: num(variables.g), b: num(variables.b) };
      });

      When("it is converted to HSL", () => {
        hsl = rgbToHsl(rgb);
      });

      Then("the result is hue <h>, saturation <s>, lightness <l>", () => {
        expect(hsl.h).toBeCloseTo(num(variables.h), 1);
        expect(hsl.s).toBeCloseTo(num(variables.s), 1);
        expect(hsl.l).toBeCloseTo(num(variables.l), 1);
      });
    },
  );

  ScenarioOutline(
    "Achromatic colors get a defined hue",
    ({ Given, When, Then, And }, variables) => {
      let rgb: RGBColor;
      let hsl: HSLColor;

      Given("the RGB color <r>, <g>, <b>", () => {
        rgb = { r: num(variables.r), g: num(variables.g), b: num(variables.b) };
      });

      When("it is converted to HSL", () => {
        hsl = rgbToHsl(rgb);
      });

      // Asserted exactly, not with a tolerance: an undefined hue that slips
      // through as NaN would silently skew every downstream hue comparison.
      Then("the hue is exactly 0", () => {
        expect(hsl.h).toBe(0);
      });

      And("the saturation is exactly 0", () => {
        expect(hsl.s).toBe(0);
      });

      And("the lightness is <l>", () => {
        expect(hsl.l).toBeCloseTo(num(variables.l), 1);
      });
    },
  );

  ScenarioOutline(
    "Round-trip conversion preserves the color",
    ({ Given, When, Then }, variables) => {
      let rgb: RGBColor;
      let roundTripped: RGBColor;

      Given("the RGB color <r>, <g>, <b>", () => {
        rgb = { r: num(variables.r), g: num(variables.g), b: num(variables.b) };
      });

      When("it is converted to HSL and back to RGB", () => {
        roundTripped = hslToRgb(rgbToHsl(rgb));
      });

      Then("the result matches the original within rounding tolerance", () => {
        expect(Math.abs(roundTripped.r - rgb.r)).toBeLessThanOrEqual(1);
        expect(Math.abs(roundTripped.g - rgb.g)).toBeLessThanOrEqual(1);
        expect(Math.abs(roundTripped.b - rgb.b)).toBeLessThanOrEqual(1);
      });
    },
  );

  // The wheel is periodic, so an angle outside [0, 360) is a legal way to name
  // a color rather than bad input -- harmony offsets are computed by adding and
  // subtracting degrees, which routinely walks off both ends.
  ScenarioOutline(
    "Hue outside the wheel is wrapped back onto it",
    ({ Given, When, Then }, variables) => {
      let hsl: HSLColor;
      let rgb: RGBColor;

      Given("the HSL color <h>, 100, 50", () => {
        hsl = { h: num(variables.h), s: 100, l: 50 };
      });

      When("it is converted to RGB", () => {
        rgb = hslToRgb(hsl);
      });

      Then("the result equals the conversion of hue <equivalent>", () => {
        expect(rgb).toEqual(
          hslToRgb({ h: num(variables.equivalent), s: 100, l: 50 }),
        );
      });
    },
  );

  Scenario("Hue stays inside the wheel", ({ Given, When, Then, And }) => {
    const channels = [0, 51, 128, 204, 255];
    let combinations: RGBColor[];
    let converted: HSLColor[];

    Given(
      "every RGB combination of the channel values 0, 51, 128, 204 and 255",
      () => {
        combinations = channels.flatMap((r) =>
          channels.flatMap((g) => channels.map((b) => ({ r, g, b }))),
        );
      },
    );

    When("each one is converted to HSL", () => {
      converted = combinations.map(rgbToHsl);
    });

    Then("every hue is at least 0 and below 360", () => {
      for (const { h } of converted) {
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(360);
      }
    });

    And("every saturation and lightness is between 0 and 100", () => {
      for (const { s, l } of converted) {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
        expect(l).toBeGreaterThanOrEqual(0);
        expect(l).toBeLessThanOrEqual(100);
      }
    });
  });
});
