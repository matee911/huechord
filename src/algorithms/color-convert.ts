import type { HSLColor, RGBColor } from "./types";

/**
 * Converts sRGB channel values (0-255) to HSL (h 0-360, s/l 0-100).
 *
 * Values are returned unrounded — the wheel positions dots by hue and harmony
 * scoring compares angles, so both want more precision than a whole degree.
 */
export const rgbToHsl = ({ r, g, b }: RGBColor): HSLColor => {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;

  // Achromatic: hue is mathematically undefined here, so pin it to 0 rather
  // than letting a 0/0 reach the caller as NaN.
  if (delta === 0) {
    return { h: 0, s: 0, l: lightness * 100 };
  }

  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let hue: number;
  if (max === red) hue = ((green - blue) / delta) % 6;
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;

  hue *= 60;
  // The red branch goes negative for hues in the 300-360 range.
  if (hue < 0) hue += 360;

  return { h: hue, s: saturation * 100, l: lightness * 100 };
};

/**
 * Converts HSL (h 0-360, s/l 0-100) back to sRGB channel values, rounded to
 * the 0-255 integers the rest of the plugin treats as a color.
 */
export const hslToRgb = ({ h, s, l }: HSLColor): RGBColor => {
  const hue = ((h % 360) + 360) % 360;
  const saturation = s / 100;
  const lightness = l / 100;

  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const offset = lightness - chroma / 2;

  const sector = Math.floor(hue / 60) % 6;
  const [red, green, blue] = [
    [chroma, second, 0],
    [second, chroma, 0],
    [0, chroma, second],
    [0, second, chroma],
    [second, 0, chroma],
    [chroma, 0, second],
  ][sector];

  return {
    r: Math.round((red + offset) * 255),
    g: Math.round((green + offset) * 255),
    b: Math.round((blue + offset) * 255),
  };
};
