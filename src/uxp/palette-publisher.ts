import { logger } from "../lib/logger";
import {
  analysisMessage,
  statusMessage,
  type BridgeMessage,
  type PanelState,
} from "../bridge/messages";
import type { DominantColor, HarmonyMatch } from "../algorithms/types";

// The real sink is a Comlink call into the WebView, so it answers with a
// promise and reports a torn-down panel by rejecting it, not by throwing.
export type BridgeSink = (message: BridgeMessage) => void | Promise<unknown>;

let sink: BridgeSink | undefined;
let webviewReady = false;
// The last thing the WebView has not been told about yet -- an analysis or a
// state. It exists because the panel can analyze a document before the WebView
// finishes loading, and postMessage has no buffer or retry of its own; without
// this, the first analysis of a session would be lost and the wheel would stay
// empty until the user made another edit.
//
// One slot for both kinds, because they answer the same question: what should
// the panel be showing right now. Two would let a stale one arrive last.
let pending: BridgeMessage | undefined;

const reportFailedSend = (error: Error): void => {
  // A closing panel can tear the WebView down between the ready handshake and
  // this call. That is a dead message, not a dead pipeline.
  logger.error("Failed to send the analysis to the WebView", error);
};

const flush = (): void => {
  if (!sink || !webviewReady || !pending) return;
  const message = pending;
  pending = undefined;
  try {
    // Both failure shapes have to be caught: a synchronous throw from the
    // wiring, and a rejection from the call that crossed into the WebView.
    // An unhandled rejection here surfaces with no panel-side trace at all.
    Promise.resolve(sink(message)).catch(reportFailedSend);
  } catch (error) {
    reportFailedSend(error as Error);
  }
};

/** Registers the WebView as the destination for bridge messages. */
export const connectWebview = (nextSink: BridgeSink): void => {
  // The handshake is deliberately NOT reset here: the WebView can announce
  // itself before the host finishes wiring up its end, and forgetting that
  // would strand the very first palette. A WebView going away resets it
  // instead, which is what `disconnectWebview` is for.
  sink = nextSink;
  flush();
};

/** Forgets the current WebView — called when the panel goes away. */
export const disconnectWebview = (): void => {
  sink = undefined;
  webviewReady = false;
  pending = undefined;
};

/** Records the WebView's handshake and releases anything held for it. */
export const markWebviewReady = (): void => {
  webviewReady = true;
  flush();
};

/**
 * Hands a freshly analyzed document to the WebView, or holds it until it can.
 * Palette and harmony go in one message: the harmony is a list of positions
 * into the palette, so the two are not separable even in principle.
 */
/** Tells the WebView about a state that is not an analysis. */
export const publishStatus = (state: PanelState): void => {
  pending = statusMessage(state);
  flush();
};

export const publishAnalysis = (
  colors: DominantColor[],
  harmony: HarmonyMatch | null,
  timestamp: number,
): void => {
  pending = analysisMessage(colors, harmony, timestamp);
  flush();
};
