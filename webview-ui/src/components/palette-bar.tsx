import React from "react";
import { cssColor, swatchWidths } from "../wheel-geometry";
import type { DominantColor } from "../../../src/algorithms/types";

export const PaletteBar = ({ colors }: { colors: DominantColor[] }) => {
  const widths = swatchWidths(colors);

  return (
    <div className="palette-bar" role="img" aria-label="Dominant color palette">
      {colors.map((color, index) => (
        <div
          key={index}
          className="palette-swatch"
          style={{
            width: `${widths[index]}%`,
            backgroundColor: cssColor(color.rgb),
          }}
          title={`${cssColor(color.rgb)} — ${Math.round(color.weight * 100)}%`}
        />
      ))}
    </div>
  );
};
