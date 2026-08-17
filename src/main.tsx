import React, { useEffect } from "react";
import { webviewInitHost } from "./webview-setup-host";
import { logger } from "./lib/logger";
import { debounce } from "./lib/debounce";
import { acquirePixels } from "./uxp/imaging";
import { listenForDocumentChanges } from "./uxp/events";

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

  useEffect(() => {
    const debouncedAcquire = debounce(() => {
      void acquirePixels();
    }, 400);

    // Cleanup can run before the subscription resolves (unmount, StrictMode's
    // double-invoke, a quick panel close/reopen). Without the flag the listener
    // registers a moment later and is never removed, so it keeps driving
    // acquisition for the rest of the session and stacks up on every remount.
    let cancelled = false;
    let unsubscribe: (() => Promise<void>) | undefined;

    listenForDocumentChanges(debouncedAcquire)
      .then((unsub) => {
        if (cancelled) void unsub();
        else unsubscribe = unsub;
      })
      .catch((error) => {
        logger.error("Failed to subscribe to document changes", error as Error);
      });

    return () => {
      cancelled = true;
      debouncedAcquire.cancel();
      void unsubscribe?.();
    };
  }, []);

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
