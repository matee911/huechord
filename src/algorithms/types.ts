export interface RGBColor {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
}

export interface HSLColor {
  h: number; // 0-360 (degrees)
  s: number; // 0-100 (percent)
  l: number; // 0-100 (percent)
}

export interface DominantColor {
  rgb: RGBColor;
  hsl: HSLColor;
  weight: number; // 0-1 (proportion of image)
}

export interface Palette {
  colors: DominantColor[];
  timestamp: number;
}

export type HarmonyType =
  | "complementary"
  | "analogous"
  | "triadic"
  | "split-complementary"
  | "tetradic"
  | "square"
  | "monochromatic";

/**
 * A harmony a palette actually shows. There is no score: a photograph either
 * forms one of these or it does not, and the colors that form it are named so
 * the panel can draw the shape through the dots it already has.
 */
export interface HarmonyMatch {
  type: HarmonyType;
  // Positions in the palette, in the order the shape connects them.
  colorIndices: number[];
  // How far the worst of them sits from its ideal position, in degrees.
  maxDeviation: number;
}
