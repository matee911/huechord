import React, { useEffect } from "react";
import { webviewInitHost } from "./webview-setup-host";
import { logger } from "./lib/logger";
import { startPixelPipeline } from "./uxp/pixel-pipeline";
import { connectWebview, disconnectWebview } from "./uxp/palette-publisher";

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
    // Tracked separately from the publisher's own state: the panel can close
    // while the WebView is still loading, and a sink registered afterwards
    // would outlive the panel that asked for it.
    let closed = false;

    webviewInitHost({ multi: false })
      .then((apis) => {
        if (closed) return;
        logger.info("WebView bridge established", {
          panels: apis.length,
        });
        // Single-panel plugin: the host resolves only once every page it was
        // asked for has loaded, and it was asked for one.
        const [panel] = apis;
        connectWebview((message) => panel.receiveBridgeMessage(message));
      })
      .catch((error: Error) => {
        logger.error("Failed to bring up the WebView bridge", error);
      });

    return () => {
      closed = true;
      disconnectWebview();
    };
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
