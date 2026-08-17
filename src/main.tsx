import React, { useEffect } from "react";
import { webviewInitHost } from "./webview-setup-host";
import { logger } from "./lib/logger";
import { startPixelPipeline } from "./uxp/pixel-pipeline";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- required by TS to augment the global JSX namespace
  namespace JSX {
    interface IntrinsicElements {
      "uxp-panel": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & { panelid?: string },
        HTMLElement
      >;
    }
  }
}

export const App = () => {
  const webviewUI = import.meta.env.VITE_BOLT_WEBVIEW_UI === "true";

  useEffect(() => {
    if (!webviewUI) return;
    logger.info("Initializing WebView host...");
    webviewInitHost({ multi: false }).then((apis) => {
      logger.info("WebView bridge established", {
        panels: apis.length,
      });
    });
  }, [webviewUI]);

  useEffect(() => startPixelPipeline(), []);

  return (
    <>
      {!webviewUI ? (
        <main>
          <p>WebView UI not enabled. Check uxp.config.ts.</p>
        </main>
      ) : (
        <></>
      )}
    </>
  );
};
