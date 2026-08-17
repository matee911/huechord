import * as Comlink from "comlink";
import { api } from "./api/api";

import type { WebviewAPI } from "../webview-ui/src/webview";
import { id, config } from "../uxp.config";
import { getColorScheme } from "./api/uxp";

const isDev = import.meta.env.VITE_BOLT_MODE === "dev";

interface UXPHTMLWebViewElement extends HTMLElement {
  uxpAllowInspector: string;
  src: string;
  postMessage: (msg: unknown) => void;
}

export const webviewInitHost = (params: {
  // webview?: UXPHTMLWebViewElement;
  multi: boolean | string[];
}): Promise<WebviewAPI[]> => {
  const multi = params ? params.multi : false;
  return new Promise((resolve, _reject) => {
    let pages = ["main"];
    if (multi === true || Array.isArray(multi)) {
      pages = config.manifest.entrypoints.map((point) =>
        point.id.split(".")!.pop()!,
      );
      console.log("webviewInitHost multi pages", pages);
    }
    const apis: WebviewAPI[] = [];
    pages.map((page, i) => {
      // if (i > 0) return;
      let webview = document.createElement("webview") as UXPHTMLWebViewElement;
      webview.className = "webview-ui";
      webview.id = `webview-${i}`;
      // Development affordance: an installed plugin should not hand every user
      // an inspector into its own WebView.
      webview.uxpAllowInspector = String(isDev);
      const origin = isDev
        ? `http://localhost:${import.meta.env.VITE_BOLT_WEBVIEW_PORT}/?page=${page}`
        : `plugin:/webview-ui/${page}.html`;
      webview.src = origin;

      const appElement = document.getElementById("app")!;
      const parent =
        i === 0
          ? appElement
          : Array.from(document.getElementsByTagName("uxp-panel")).find(
              (item) => item.getAttribute("panelid") === `${id}.${page}`,
            );
      console.log({ parent });
      webview = parent!.appendChild(webview) as UXPHTMLWebViewElement;

      webview.addEventListener("message", (e) => {
        console.log(
          "webview message",
          page,
          (e as Event & { message: unknown }).message,
        );
      });
      let loaded = false;
      webview.addEventListener("loadstop", (_e) => {
        if (loaded) return;
        loaded = true;
        const backendAPI = { api };
        const backendEndpoint = {
          postMessage: (msg: unknown, transferrables: unknown) => {
            console.log("running postMessage", page, msg, transferrables);
            return webview!.postMessage(msg);
          },
          addEventListener: (
            type: string,
            handler: EventListenerOrEventListenerObject,
          ) => {
            console.log("running addEventListener", webview!.addEventListener);
            webview!.addEventListener("message", handler);
          },
          removeEventListener: (
            type: string,
            handler: EventListenerOrEventListenerObject,
          ) => {
            console.log(
              "running removeEventListener",
              webview!.removeEventListener,
            );
            webview!.removeEventListener("message", handler);
          },
        };

        console.log({ origin });

        const endpoint = Comlink.windowEndpoint(backendEndpoint);

        // Now we bind to the Webview's APIs
        // @ts-expect-error -- Comlink's Remote<T> wrapper doesn't structurally match WebviewAPI
        const comlinkAPI = Comlink.wrap(endpoint) as WebviewAPI;
        // TODO: might need to adjust for multi webviews
        apis.push(comlinkAPI);
        // Once - At End
        Comlink.expose(
          backendAPI,
          endpoint,
          [origin], // doesn't work in prod
        );
        if (apis.length === pages.length) {
          console.log("webviewInitHost resolved");
          for (const api of apis) {
            getColorScheme().then((scheme) => {
              api.updateColorScheme(scheme);
            });
            // @ts-expect-error -- document.theme is a UXP-host global, not in DOM lib types
            document.theme.onUpdated.addListener(() =>
              getColorScheme().then((scheme) => {
                api.updateColorScheme(scheme);
              }),
            );
          }
          resolve(apis);
        }
        // else {
        //   console.log(
        //     "webviewInitHost not resolved yet",
        //     apis.length,
        //     pages.length,
        //   );
        // }

        // Send Basic Message to Webview
        // webview.postMessage({type: "uxp-to-webview"});

        // Get Basic Messages from Webview
        // let lastEventId = ''
        window.addEventListener("message", (e) => console.log("MESSAGE:", e));
      });
    });
  });
};
