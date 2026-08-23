import * as photoshop from "./photoshop";
import { uxp } from "../globals";
import * as uxpLib from "./uxp";
import { handleWebviewMessage } from "../uxp/webview-inbox";

const hostName =
  uxp?.host?.name.toLowerCase().replace(/\s/g, "") || ("" as string);

let host = {} as typeof photoshop;

export type API = typeof host & typeof uxpLib;

if (hostName.startsWith("photoshop")) host = photoshop;

// This is the surface the WebView can call through Comlink, which is why the
// bridge's inbound half is exposed here rather than reached for directly.
export const api = { ...uxpLib, ...host, handleWebviewMessage };
