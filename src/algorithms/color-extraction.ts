import quantize, { type RgbPixel } from "quantize";
import { rgbToHsl } from "./color-convert";
import type { DominantColor, RGBColor } from "./types";

/**
 * Upper bound handed to the quantizer. It returns *up to* this many colors and
 * routinely returns fewer — a flat image genuinely has one dominant color, not
 * eight.
 */
export const MAX_DOMINANT_COLORS = 8;

/**
 * Reduces an interleaved pixel buffer to the colors that cover most of it,
 * heaviest first. Pure and host-agnostic: it takes the raw samples and the
 * channel count, never a Photoshop handle.
 *
 * `channels` must be at least 3 — the first three samples of every pixel are
 * read as red, green and blue, and a fourth, if present, as alpha.
 *
 * `maxColors` must be between 2 and 256, the range the quantizer accepts.
 * Outside it there is no palette to compute and the result is empty.
 */
export const extractDominantColors = (
  data: Uint8Array | Uint8ClampedArray,
  channels: number,
  maxColors: number = MAX_DOMINANT_COLORS,
): DominantColor[] => {
  const pixels = collectVisiblePixels(data, channels);
  if (pixels.length === 0) return [];

  // Not defensive padding: the quantizer answers `false` rather than throwing
  // when it has nothing to work with, and a fully masked selection reaches
  // here as an empty pixel list.
  const colorMap = quantize(pixels, maxColors);
  if (!colorMap) return [];

  const populations = new Map<string, { rgb: RGBColor; count: number }>();

  // The quantizer's public surface exposes the palette but not how many pixels
  // landed in each cluster, so attribute them here. A second pass also drops
  // clusters that ended up empty, which is what keeps a two-color image from
  // reporting a third, unpopulated color.
  //
  // nearest() rather than the more obvious map(): map() first asks each box
  // whether it contains the pixel, and that containment check assigns two
  // undeclared variables. Under a script that is sloppy mode creating globals;
  // bundled as a module it is strict mode throwing ReferenceError, which is
  // what Photoshop actually runs. Unit tests cannot see it either, because the
  // library resolves as CommonJS there and CommonJS is not strict.
  //
  // Nothing is lost by skipping the containment step: map() falls through to
  // exactly this call whenever no box contains the pixel, and "closest palette
  // color in RGB" is the attribution this function wants anyway.
  for (const pixel of pixels) {
    const [r, g, b] = colorMap.nearest(pixel);
    const key = `${r},${g},${b}`;
    const population = populations.get(key);

    if (population) population.count += 1;
    else populations.set(key, { rgb: { r, g, b }, count: 1 });
  }

  return [...populations.values()]
    .map(({ rgb, count }) => ({
      rgb,
      hsl: rgbToHsl(rgb),
      weight: count / pixels.length,
    }))
    .sort((a, b) => b.weight - a.weight);
};

/**
 * Flattens the buffer into the tuples the quantizer expects, skipping fully
 * transparent pixels: their RGB is undefined in a composite, so quantizing it
 * invents colors that are nowhere in the visible image. Partial transparency
 * is kept — the composite has already blended it into what the user sees.
 */
const collectVisiblePixels = (
  data: Uint8Array | Uint8ClampedArray,
  channels: number,
): RgbPixel[] => {
  const pixels: RgbPixel[] = [];
  const hasAlpha = channels > 3;

  for (let offset = 0; offset + channels <= data.length; offset += channels) {
    if (hasAlpha && data[offset + 3] === 0) continue;
    pixels.push([data[offset], data[offset + 1], data[offset + 2]]);
  }

  return pixels;
};
