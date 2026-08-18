import { logger } from "../lib/logger";
import {
  parseBridgeMessage,
  paletteMessage,
  type BridgeMessage,
  type PaletteMessage,
} from "../bridge/messages";
import type { DominantColor } from "../algorithms/types";

// The real sink is a Comlink call into the WebView, so it answers with a
// promise and reports a torn-down panel by rejecting it, not by throwing.
export type BridgeSink = (message: BridgeMessage) => void | Promise<unknown>;

let sink: BridgeSink | undefined;
let webviewReady = false;
// The last palette the WebView has not been told about yet. It exists because
// the panel can extract a palette before the WebView finishes loading, and
// postMessage has no buffer or retry of its own — without this, the first
// analysis of a session would be lost and the wheel would stay empty until
// the user made another edit.
let pending: PaletteMessage | undefined;

const reportFailedSend = (error: Error): void => {
  // A closing panel can tear the WebView down between the ready handshake and
  // this call. That is a dead message, not a dead pipeline.
  logger.error("Failed to send the palette to the WebView", error);
};

const send = (message: PaletteMessage): void => {
  if (!sink) return;
  try {
    // Both failure shapes have to be caught: a synchronous throw from the
    // wiring, and a rejection from the call that crossed into the WebView.
    // An unhandled rejection here surfaces with no panel-side trace at all.
    Promise.resolve(sink(message)).catch(reportFailedSend);
  } catch (error) {
    reportFailedSend(error as Error);
  }
};

const flush = (): void => {
  if (!sink || !webviewReady || !pending) return;
  const message = pending;
  pending = undefined;
  send(message);
};

/** Registers the WebView as the destination for bridge messages. */
export const connectWebview = (nextSink: BridgeSink): void => {
  sink = nextSink;
  flush();
};

/** Forgets the current WebView — called when the panel goes away. */
export const disconnectWebview = (): void => {
  sink = undefined;
  webviewReady = false;
  pending = undefined;
};

/** Handles anything the WebView sends back over the bridge. */
export const handleWebviewMessage = (raw: unknown): void => {
  const message = parseBridgeMessage(raw);
  if (!message) return;
  if (message.type !== "ready") return;

  webviewReady = true;
  flush();
};

/** Hands a freshly extracted palette to the WebView, or holds it until it can. */
export const publishPalette = (
  colors: DominantColor[],
  timestamp: number,
): void => {
  pending = paletteMessage(colors, timestamp);
  flush();
};
