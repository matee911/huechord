import React, { useEffect } from "react";
import { webviewInitHost } from "./webview-setup-host";
import type { WebviewAPI } from "../webview-ui/src/webview";
import { logger } from "./lib/logger";

declare global {
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

  if (webviewUI) {
    useEffect(() => {
      logger.info("Initializing WebView host...");
      webviewInitHost({ multi: false }).then((apis) => {
        logger.info("WebView bridge established", {
          panels: apis.length,
        });
      });
    }, []);
  }

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
