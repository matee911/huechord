import React, { useEffect, useSyncExternalStore } from "react";
import * as webviewAPI from "./webview-api";
import { initWebview } from "./webview-setup";
import {
  getHarmony,
  getPalette,
  getPaletteReceivedAt,
  getPanelState,
  getPickedColors,
  subscribeToPalette,
} from "./palette-store";
import { reportRenderTime } from "./render-budget";
import { ColorWheel } from "./components/color-wheel";
import { PaletteBar } from "./components/palette-bar";
import { HarmonyLabel } from "./components/harmony-label";
import type { PanelState } from "../../src/bridge/messages";
import type { DominantColor, PickedColor } from "../../src/algorithms/types";

// The handshake and the Comlink wiring belong to the document, not to a
// render: App re-renders on every palette, and repeating `expose` plus a
// fresh `ready` per edit would re-announce a WebView that never went away.
initWebview(webviewAPI);

// The three states the line under the wheel can be in. Kept out of the JSX
// because "no colors" and "no document" look the same on screen and read
// completely differently to whoever is holding the mouse.
const panelStatus = (colorCount: number, state: PanelState | null): string => {
  if (state === "no-document") return "Open a document to analyze";
  if (colorCount > 0) return `${colorCount} dominant colors`;
  return "Open a document and start editing";
};

// A stable empty palette, so a panel with nothing to show does not hand the
// wheel a fresh array on every render.
const EMPTY_PALETTE: DominantColor[] = [];
const EMPTY_PICKED: PickedColor[] = [];

export const App = () => {
  const colors = useSyncExternalStore(subscribeToPalette, getPalette);
  const harmony = useSyncExternalStore(subscribeToPalette, getHarmony);
  const state = useSyncExternalStore(subscribeToPalette, getPanelState);
  const picked = useSyncExternalStore(subscribeToPalette, getPickedColors);

  const shown = state === "no-document" ? EMPTY_PALETTE : colors;
  const shownHarmony = state === "no-document" ? null : harmony;
  const shownPicked = state === "no-document" ? EMPTY_PICKED : picked;

  useEffect(() => {
    const receivedAt = getPaletteReceivedAt();
    if (receivedAt > 0)
      reportRenderTime(performance.now() - receivedAt, colors.length);
  }, [colors]);

  return (
    <main className="panel">
      {/* Nothing from the previous document while the panel is saying there
          is no document: a wheel full of dots under "Open a document to
          analyze" describes a file that is not open any more. */}
      <ColorWheel colors={shown} harmony={shownHarmony} picked={shownPicked} />
      <PaletteBar colors={shown} />
      {/* No harmony line either: "No harmony in this frame" under "Open a
          document to analyze" is a claim about a frame that does not exist. */}
      {state === "no-document" ? null : <HarmonyLabel harmony={harmony} />}
      <p className="panel-status">{panelStatus(colors.length, state)}</p>
    </main>
  );
};
