import React from "react";
import { harmonyShape } from "../wheel-geometry";
import type {
  DominantColor,
  HarmonyMatch,
} from "../../../src/algorithms/types";

/**
 * The shape a detected harmony makes on the wheel, drawn through the dots that
 * form it. It shares the wheel's coordinate space rather than owning one, so a
 * corner of the shape and the dot it belongs to cannot drift apart.
 *
 * Rendered before the dots by document order: the shape is the relationship,
 * and the colors are what the retoucher is actually reading.
 */
export const HarmonyOverlay = ({
  colors,
  harmony,
  radius,
}: {
  colors: DominantColor[];
  harmony: HarmonyMatch | null;
  radius: number;
}) => {
  const points = harmonyShape(colors, harmony, radius);
  if (!points) return null;

  // Two points are drawn by SVG as a single segment rather than as a degenerate
  // shape, so one element covers a complementary pair as well as a square.
  const outline = points.map(({ x, y }) => `${x},${y}`).join(" ");
  // A shape the frame only comes close to is drawn as one: broken, because the
  // relationship is not quite there, in the same place a solid one would be.
  const shape = harmony?.nearMiss ? "harmony-shape is-near" : "harmony-shape";

  return (
    <g aria-hidden="true">
      {/* Drawn twice: a dark, wider line underneath so the shape stays visible
          where it crosses the desaturated center of the wheel, the way the
          dots carry their own dark stroke for the same reason. */}
      <polygon className="harmony-shape-shadow" points={outline} />
      <polygon className={shape} points={outline} />
    </g>
  );
};
