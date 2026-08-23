import { photoshop } from "../globals";
import { rgbToHsl } from "../algorithms/color-convert";
import { logger } from "../lib/logger";
import { MAX_PICKED_COLORS } from "../bridge/messages";
import type { PickedColor } from "../algorithms/types";

/**
 * The colors the user pointed at, read from Photoshop's own Color Sampler
 * markers.
 *
 * A UXP panel never sees a click on the canvas -- it is a separate surface,
 * there is no pointer event to subscribe to and a plugin cannot add a tool. So
 * picking a point is done with the tool Photoshop already has for it, and this
 * reads what that tool left behind.
 */

// A sampler over a fully transparent pixel reports NoColor, which has no rgb to
// read. Detected by asking for the shape this needs rather than by the class
// name, which is a string the host owns.
const hasRgb = (color: unknown): color is { rgb: NonNullable<unknown> } =>
  typeof color === "object" && color !== null && "rgb" in color;

export const readPickedColors = (): PickedColor[] => {
  try {
    const samplers = photoshop.app.activeDocument?.colorSamplers ?? [];
    const picked: PickedColor[] = [];

    for (const sampler of samplers) {
      const { color } = sampler;
      if (!hasRgb(color)) continue;

      const { red, green, blue } = color.rgb;
      const rgb = {
        r: Math.round(red),
        g: Math.round(green),
        b: Math.round(blue),
      };
      picked.push({ rgb, hsl: rgbToHsl(rgb) });
    }

    // Kept inside what the receiver will accept. Photoshop's own limit is ten
    // and this reads its collection, so going over should be impossible -- but
    // an oversized message is refused whole, which would cost the palette and
    // the harmony as well as the rings, and that is a bad way to find out the
    // assumption was wrong.
    if (picked.length > MAX_PICKED_COLORS) {
      logger.warn("More picked colors than the panel will accept", {
        found: picked.length,
      });
      return picked.slice(0, MAX_PICKED_COLORS);
    }

    return picked;
  } catch (error) {
    // Reading markers is a garnish on the analysis. A host that will not answer
    // costs the rings, not the palette.
    logger.error("Failed to read the picked colors", error as Error);
    return [];
  }
};
