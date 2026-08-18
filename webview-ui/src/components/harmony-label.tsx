import React from "react";
import { harmonyLabel } from "../wheel-geometry";
import type { HarmonyMatch } from "../../../src/algorithms/types";

export const HarmonyLabel = ({ harmony }: { harmony: HarmonyMatch | null }) => (
  // Announced on change: the panel updates on its own as the retoucher grades,
  // and without this a screen-reader user would have to go looking for the
  // answer after every edit to find out it moved.
  <p
    className={harmony ? "harmony-name" : "harmony-name is-absent"}
    aria-live="polite"
  >
    {harmonyLabel(harmony)}
  </p>
);
