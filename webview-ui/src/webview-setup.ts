import * as Comlink from "comlink";

import { updateColorScheme } from "./webview-api";
import { readyMessage } from "../../src/bridge/messages";
import { reportPanelVisibility } from "./panel-visibility";
import { logger } from "../../src/lib/logger";

// Deliberately not the concrete UXP-side `API` type: the WebView context is
// purely presentational and must not depend on UXP-only code (see CLAUDE.md).
interface HostAPI {
  getColorScheme: () => Promise<Parameters<typeof updateColorScheme>[0]>;
  handleWebviewMessage: (message: unknown) => Promise<void>;
}

declare global {
  interface Window {
    uxpHost: {
      postMessage: (msg: unknown) => void;
      addEventListener: (
        type: string,
        handler: EventListenerOrEventListenerObject,
      ) => void;
      removeEventListener: (
        type: string,
        handler: EventListenerOrEventListenerObject,
      ) => void;
    };
  }
}

const hostEndpoint = {
  postMessage: (msg: unknown) => window.uxpHost.postMessage(msg),
  addEventListener: (
    type: string,
    handler: EventListenerOrEventListenerObject,
  ) => {
    window.uxpHost.addEventListener("message", handler);
  },
  removeEventListener: (
    type: string,
    handler: EventListenerOrEventListenerObject,
  ) => {
    window.uxpHost.removeEventListener("message", handler);
  },
};

export const initWebview = (
  webviewAPI: object,
): { page: string; api: HostAPI } => {
  const page =
    new URL(location.href).searchParams.get("page") ||
    location.href.split("/").pop()!.replace(".html", "");
  console.log("initWebview called", webviewAPI);
  const endpoint = Comlink.windowEndpoint(hostEndpoint);
  // const endpoint = Comlink.windowEndpoint(hostEndpoint, window);
  const comlinkAPI = Comlink.wrap(endpoint);
  Comlink.expose(webviewAPI, endpoint);
  // @ts-expect-error -- Comlink's Remote<T> wrapper doesn't structurally match the exposed shape
  const api = comlinkAPI.api as HostAPI;
  // update color scheme on load
  api.getColorScheme().then((scheme) => {
    updateColorScheme(scheme);
  });
  // The handshake. Until this lands, the UXP side holds the palette back —
  // anything it sent before this document registered its Comlink listener
  // would be dropped with no retry, leaving the panel blank until the next edit.
  api.handleWebviewMessage(readyMessage()).catch((error: Error) => {
    logger.error("Failed to announce the WebView as ready", error);
  });

  // After the handshake, so the two arrive in the order the host reads them in:
  // the page exists, and then it says whether anyone can see it.
  reportPanelVisibility((message) => {
    void api.handleWebviewMessage(message).catch((error: Error) => {
      logger.error("Failed to report the panel's visibility", error);
    });
  });
  return { api, page };
};

// basic way to send a message
// const sendMessage = () => window.uxpHost.postMessage({ type: "message", text: "msg" },"*");

// basic way to get a message
// window.addEventListener("message", (e) => console.log(e));
