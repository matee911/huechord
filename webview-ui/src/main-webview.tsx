import React, { useEffect, useSyncExternalStore } from "react";
import * as webviewAPI from "./webview-api";
import { initWebview } from "./webview-setup";
import {
  getPalette,
  getPaletteReceivedAt,
  subscribeToPalette,
} from "./palette-store";
import { reportRenderTime } from "./render-budget";
import { ColorWheel } from "./components/color-wheel";
import { PaletteBar } from "./components/palette-bar";

// The handshake and the Comlink wiring belong to the document, not to a
// render: App re-renders on every palette, and repeating `expose` plus a
// fresh `ready` per edit would re-announce a WebView that never went away.
initWebview(webviewAPI);

export const App = () => {
  const colors = useSyncExternalStore(subscribeToPalette, getPalette);

  useEffect(() => {
    const receivedAt = getPaletteReceivedAt();
    if (receivedAt > 0)
      reportRenderTime(performance.now() - receivedAt, colors.length);
  }, [colors]);

  return (
    <main className="panel">
      <ColorWheel colors={colors} />
      <PaletteBar colors={colors} />
      <p className="panel-status">
        {colors.length > 0
          ? `${colors.length} dominant colors`
          : "Open a document and start editing"}
      </p>
    </main>
  );
};
