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
  for (const pixel of pixels) {
    const [r, g, b] = colorMap.map(pixel);
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
