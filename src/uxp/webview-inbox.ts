import { parseBridgeMessage } from "../bridge/messages";
import { markWebviewReady } from "./palette-publisher";
import { logger } from "../lib/logger";

/**
 * The one door for everything the WebView sends back. It parses once and hands
 * each message to whoever cares — the publisher used to be that door, back when
 * it was the only thing listening, and a second consumer made that a place
 * where the publisher had to know about concerns that are not its own.
 */

export type VisibilityListener = (visible: boolean) => void;

let onVisibility: VisibilityListener | undefined;

/** Subscribes to whether the panel is on screen. One listener at a time. */
export const listenForPanelVisibility = (
  listener: VisibilityListener,
): (() => void) => {
  onVisibility = listener;

  return () => {
    // Guarded so a late teardown cannot unsubscribe whoever replaced it.
    if (onVisibility === listener) onVisibility = undefined;
  };
};

/** Handles anything the WebView sends back over the bridge. */
export const handleWebviewMessage = (raw: unknown): void => {
  const message = parseBridgeMessage(raw);
  // Null means the message was already rejected and logged by the contract.
  if (!message) return;

  if (message.type === "ready") {
    markWebviewReady();
    return;
  }

  if (message.type === "visibility") {
    // Whatever the listener does with this -- tearing a pipeline down, in
    // practice -- must not travel back over the bridge. Comlink reports a
    // throw here to the WebView as a failed call, which is both the wrong
    // place to learn about it and the wrong side to handle it.
    try {
      onVisibility?.(message.visible);
    } catch (error) {
      logger.error("Failed to apply the panel's visibility", error as Error);
    }
    return;
  }

  // An analysis travels host -> WebView. One arriving here is well-formed but
  // pointed the wrong way, so there is nothing to do with it.
};
