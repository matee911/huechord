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
  colorCount: number,
  harmony: HarmonyMatch | null,
): string => {
  const wheel = `Color wheel with ${colorCount} dominant colors`;
  if (!harmony) return wheel;
  return harmony.nearMiss
    ? `${wheel}, close to a ${harmony.type} harmony`
    : `${wheel}, forming a ${harmony.type} harmony`;
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
      aria-label={wheelLabel(colors.length, harmony)}
    >
      <HarmonyOverlay colors={colors} harmony={harmony} radius={WHEEL_RADIUS} />
      {colors.map((color, index) => {
        const { x, y } = dotPosition(color.hsl.h, color.hsl.s, WHEEL_RADIUS);
        // The one color holding a near-miss shape open. Marked rather than
        // named in prose: the retoucher is looking at the wheel, and "the one
        // at 268 degrees" is not something anyone reads off a wheel.
        const outOfPlace = harmony?.nearMiss?.outlierIndex === index;
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
