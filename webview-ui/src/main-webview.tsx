import React, { useEffect, useSyncExternalStore } from "react";
import * as webviewAPI from "./webview-api";
import { initWebview } from "./webview-setup";
import {
  getHarmony,
  getPalette,
  getPaletteReceivedAt,
  getPanelState,
  subscribeToPalette,
} from "./palette-store";
import { reportRenderTime } from "./render-budget";
import { ColorWheel } from "./components/color-wheel";
import { PaletteBar } from "./components/palette-bar";
import { HarmonyLabel } from "./components/harmony-label";
import type { PanelState } from "../../src/bridge/messages";

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

export const App = () => {
  const colors = useSyncExternalStore(subscribeToPalette, getPalette);
  const harmony = useSyncExternalStore(subscribeToPalette, getHarmony);
  const state = useSyncExternalStore(subscribeToPalette, getPanelState);

  useEffect(() => {
    const receivedAt = getPaletteReceivedAt();
    if (receivedAt > 0)
      reportRenderTime(performance.now() - receivedAt, colors.length);
  }, [colors]);

  return (
    <main className="panel">
      <ColorWheel colors={colors} harmony={harmony} />
      <PaletteBar colors={colors} />
      <HarmonyLabel harmony={harmony} />
      <p className="panel-status">{panelStatus(colors.length, state)}</p>
    </main>
  );
};
