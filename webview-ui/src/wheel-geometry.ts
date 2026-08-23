import type { DominantColor, HarmonyMatch } from "../../src/algorithms/types";

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

/**
 * What the panel calls the harmony it found, or that it found none. It lives
 * here with the rest of the presentation rules rather than inside a component,
 * so the wording can be pinned by a test without rendering anything.
 */
export const harmonyLabel = (harmony: HarmonyMatch | null): string => {
  if (!harmony) return "No harmony in this frame";

  const name = harmony.type.charAt(0).toUpperCase() + harmony.type.slice(1);
  // Monochromatic is the one harmony with no shape to draw, so the label has
  // to carry what the wheel cannot: without the qualifier, a named harmony and
  // an empty wheel read as a shape that failed to render.
  if (harmony.type === "monochromatic") return `${name} — one hue`;

  // "Close to" rather than the name alone, and no number after it: the dashed
  // shape and the marked dot say which way to move without claiming a
  // precision the pipeline does not have. See ADR-009.
  return harmony.nearMiss ? `Close to ${harmony.type.replace("-", " ")}` : name;
};

/**
 * The dots a harmony runs through, in the order the shape connects them, as
 * SVG polygon points — or `null` when there is no shape to draw. Positions come
 * from the match rather than from a second pass over the palette, so a vertex
 * always lands on the dot the user sees.
 *
 * Monochromatic draws nothing: it is a cluster of one hue, and a line between
 * dots a few degrees apart says nothing the dots do not already say.
 */
export const harmonyShape = (
  colors: DominantColor[],
  harmony: HarmonyMatch | null,
  wheelRadius: number,
): { x: number; y: number }[] | null => {
  if (
    !harmony ||
    harmony.type === "monochromatic" ||
    harmony.colorIndices.length < 2
  )
    return null;

  return harmony.colorIndices.map((index) => {
    const { hsl } = colors[index];
    return dotPosition(hsl.h, hsl.s, wheelRadius);
  });
};

export const cssColor = ({ r, g, b }: DominantColor["rgb"]): string =>
  `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
