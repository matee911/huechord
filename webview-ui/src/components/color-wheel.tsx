import React from "react";
import { cssColor, dotPosition, dotRadius } from "../wheel-geometry";
import { HarmonyOverlay } from "./harmony-overlay";
import type {
  DominantColor,
  HarmonyMatch,
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
): string => {
  const wheel = `Color wheel with ${colors.length} dominant colors`;
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

export const ColorWheel = ({
  colors,
  harmony,
}: {
  colors: DominantColor[];
  harmony: HarmonyMatch | null;
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
      aria-label={wheelLabel(colors, harmony)}
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
    </svg>
  </div>
);
