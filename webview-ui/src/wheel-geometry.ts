import type { DominantColor } from "../../src/algorithms/types";

/**
 * Pure geometry for the panel: where a color sits on the wheel and how much
 * room it gets in the palette bar. Kept apart from the components so the math
 * can be tested without rendering anything.
 */

/**
 * Hue is the angle and saturation the distance from the center, so a washed-out
 * color sits near the middle and a vivid one near the rim. Zero degrees points
 * up and hue runs clockwise, which is how a color wheel is read on paper.
 */
export const dotPosition = (
  hue: number,
  saturation: number,
  wheelRadius: number,
): { x: number; y: number } => {
  const angle = ((hue % 360) * Math.PI) / 180;
  const distance = (Math.min(Math.max(saturation, 0), 100) / 100) * wheelRadius;
  return {
    x: distance * Math.sin(angle),
    y: -distance * Math.cos(angle),
  };
};

/**
 * Weight scales the dot's *area*, not its radius — a color covering half the
 * image should look half as big, and the eye reads area, not the radius.
 */
export const dotRadius = (
  weight: number,
  minRadius: number,
  maxRadius: number,
): number => {
  const clamped = Math.min(Math.max(weight, 0), 1);
  return minRadius + (maxRadius - minRadius) * Math.sqrt(clamped);
};

/**
 * Widths for the palette bar, as percentages summing to 100. Weights come from
 * the extractor already normalized, but a rounding drift there would otherwise
 * show up as a gap at the end of the bar.
 */
export const swatchWidths = (colors: DominantColor[]): number[] => {
  const total = colors.reduce((sum, { weight }) => sum + weight, 0);
  if (total <= 0) return colors.map(() => 100 / colors.length);
  return colors.map(({ weight }) => (weight / total) * 100);
};

export const cssColor = ({ r, g, b }: DominantColor["rgb"]): string =>
  `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
