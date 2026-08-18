import { parseBridgeMessage } from "../../src/bridge/messages";
import { logger } from "../../src/lib/logger";
import type { DominantColor } from "../../src/algorithms/types";

type Listener = (colors: DominantColor[]) => void;

// The WebView receives palettes over Comlink, outside React's world. This is
// the one place that boundary is crossed: messages come in here, components
// subscribe. Keeping it out of the components is what lets them stay purely
// presentational (CLAUDE.md).
let colors: DominantColor[] = [];
const listeners = new Set<Listener>();

export const getPalette = (): DominantColor[] => colors;

export const subscribeToPalette = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Entry point for everything arriving over the bridge. A message this build
 * does not understand is dropped with a log line and the panel keeps showing
 * the last good palette — it never throws, because a throw here would take
 * down the whole WebView.
 */
export const receiveBridgeMessage = (raw: unknown): void => {
  const message = parseBridgeMessage(raw);
  if (!message || message.type !== "palette") return;

  colors = message.payload.colors;
  for (const listener of listeners) {
    try {
      listener(colors);
    } catch (error) {
      logger.error("A palette listener failed", error as Error);
    }
  }
};
