import React from "react";
import { cssColor, dotPosition, dotRadius } from "../wheel-geometry";
import { HarmonyOverlay } from "./harmony-overlay";
import type {
  DominantColor,
  HarmonyMatch,
  PickedColor,
} from "../../../src/algorithms/types";

// The wheel is drawn in its own coordinate space and scaled by the SVG
// viewBox, so the panel can be resized without recomputing any geometry.
const VIEWPORT_RADIUS = 100;
const MIN_DOT_RADIUS = 4;
const MAX_DOT_RADIUS = 16;
// Dots are placed on a smaller circle than the one they are drawn in, so a
// fully saturated color -- the common case when grading -- sits against the
// rim instead of being sliced in half by the edge of the viewBox.
const WHEEL_RADIUS = VIEWPORT_RADIUS - MAX_DOT_RADIUS;

// Spoken to a screen-reader user, who gets none of the dashes and marks the
// sighted panel uses to say the same thing.
const wheelLabel = (
  colors: DominantColor[],
  harmony: HarmonyMatch | null,
  pickedCount: number,
): string => {
  const marked = pickedCount > 0 ? ` and ${pickedCount} picked points` : "";
  const wheel = `Color wheel with ${colors.length} dominant colors${marked}`;
  if (!harmony) return wheel;
  if (!harmony.nearMiss) return `${wheel}, forming a ${harmony.type} harmony`;

  // The hues are spoken, because the dashed ring that says the same thing to a
  // sighted user says nothing at all to a screen reader -- and which color to
  // move is the actionable half of "you are close".
  const hues = harmony.nearMiss.outlierIndices
    .map((index) => Math.round(colors[index].hsl.h))
    .join(" and ");
  return `${wheel}, close to a ${harmony.type} harmony; out of place at hue ${hues}`;
};

// A picked point is drawn as a diamond, at one size whatever it marks: it
// covers no share of the image, so there is no weight to read a radius from.
//
// A shape rather than another ring, because the near-miss marker is already a
// ring around a dot -- two rings differing only by a dash pattern would be one
// marker as far as anyone glancing at the panel is concerned, and under a
// light host theme both are dark strokes of the same color.
const PICKED_RADIUS = 6;

export const ColorWheel = ({
  colors,
  harmony,
  picked,
}: {
  colors: DominantColor[];
  harmony: HarmonyMatch | null;
  picked: PickedColor[];
}) => (
  <div className="wheel">
    {/* The hue ring and the desaturated center are CSS gradients painted once.
        Only the dots below are re-rendered when the palette changes, which is
        what keeps an update off the wheel's own paint path. */}
    <div className="wheel-face" aria-hidden="true" />
    <svg
      className="wheel-dots"
      viewBox={`${-VIEWPORT_RADIUS} ${-VIEWPORT_RADIUS} ${VIEWPORT_RADIUS * 2} ${VIEWPORT_RADIUS * 2}`}
      role="img"
      aria-label={wheelLabel(colors, harmony, picked.length)}
    >
      <HarmonyOverlay colors={colors} harmony={harmony} radius={WHEEL_RADIUS} />
      {colors.map((color, index) => {
        const { x, y } = dotPosition(color.hsl.h, color.hsl.s, WHEEL_RADIUS);
        // A color holding a near-miss shape open. Marked on the wheel for
        // whoever is looking at it, and named by hue in the label below for
        // whoever is not.
        const outOfPlace = Boolean(
          harmony?.nearMiss?.outlierIndices.includes(index),
        );
        return (
          <circle
            // Position and color both move every update, so neither can
            // identify a dot across renders — the slot in the palette can.
            key={index}
            cx={x}
            cy={y}
            r={dotRadius(color.weight, MIN_DOT_RADIUS, MAX_DOT_RADIUS)}
            fill={cssColor(color.rgb)}
            className={outOfPlace ? "wheel-dot is-out-of-place" : "wheel-dot"}
          />
        );
      })}
      {/* Drawn after the dots, so a ring over a dominant color is not hidden
          by it -- the point of a ring is that the user asked for that exact
          pixel, and the answer must not be covered by the average around it. */}
      {picked.map((color, index) => {
        const { x, y } = dotPosition(color.hsl.h, color.hsl.s, WHEEL_RADIUS);
        const corners = [
          `${x},${y - PICKED_RADIUS}`,
          `${x + PICKED_RADIUS},${y}`,
          `${x},${y + PICKED_RADIUS}`,
          `${x - PICKED_RADIUS},${y}`,
        ].join(" ");
        return (
          <polygon
            // The color identifies it better than the slot does: samplers are
            // added and removed from the middle of the list, and an index key
            // would carry one marker's identity onto another's color.
            key={`${cssColor(color.rgb)}-${index}`}
            points={corners}
            fill={cssColor(color.rgb)}
            className="wheel-picked"
          />
        );
      })}
    </svg>
  </div>
);
