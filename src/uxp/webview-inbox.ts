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

  // Whatever handling a message leads to -- tearing a pipeline down, reaching
  // into the host -- must not travel back over the bridge. This is called by
  // Comlink, which reports a throw to the WebView as a failed call: the wrong
  // place to learn about it and the wrong side to do anything about it.
  try {
    if (message.type === "ready") {
      markWebviewReady();
      return;
    }

    if (message.type === "visibility") {
      onVisibility?.(message.visible);
      return;
    }

    // An analysis travels host -> WebView. One arriving here is well-formed but
    // pointed the wrong way, so there is nothing to do with it.
  } catch (error) {
    logger.error(
      `Failed to handle a ${message.type} message from the WebView`,
      error as Error,
    );
  }
};
