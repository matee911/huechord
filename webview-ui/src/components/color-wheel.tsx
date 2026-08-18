import React from "react";
import { cssColor, dotPosition, dotRadius } from "../wheel-geometry";
import type { DominantColor } from "../../../src/algorithms/types";

// The wheel is drawn in its own coordinate space and scaled by the SVG
// viewBox, so the panel can be resized without recomputing any geometry.
const WHEEL_RADIUS = 100;
const MIN_DOT_RADIUS = 4;
const MAX_DOT_RADIUS = 16;

export const ColorWheel = ({ colors }: { colors: DominantColor[] }) => (
  <div className="wheel">
    {/* The hue ring and the desaturated center are CSS gradients painted once.
        Only the dots below are re-rendered when the palette changes, which is
        what keeps an update off the wheel's own paint path. */}
    <div className="wheel-face" aria-hidden="true" />
    <svg
      className="wheel-dots"
      viewBox={`${-WHEEL_RADIUS} ${-WHEEL_RADIUS} ${WHEEL_RADIUS * 2} ${WHEEL_RADIUS * 2}`}
      role="img"
      aria-label={`Color wheel with ${colors.length} dominant colors`}
    >
      {colors.map((color, index) => {
        const { x, y } = dotPosition(color.hsl.h, color.hsl.s, WHEEL_RADIUS);
        return (
          <circle
            // Position and color both move every update, so neither can
            // identify a dot across renders — the slot in the palette can.
            key={index}
            cx={x}
            cy={y}
            r={dotRadius(color.weight, MIN_DOT_RADIUS, MAX_DOT_RADIUS)}
            fill={cssColor(color.rgb)}
            className="wheel-dot"
          />
        );
      })}
    </svg>
  </div>
);
