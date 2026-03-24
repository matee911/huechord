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
  | "monochromatic";

export interface HarmonyResult {
  type: HarmonyType;
  score: number; // 0-100 (percent match)
  idealAngles: number[]; // ideal hue positions on wheel
}
