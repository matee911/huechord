import { parseBridgeMessage } from "../../src/bridge/messages";
import type { DominantColor, HarmonyMatch } from "../../src/algorithms/types";

type Listener = () => void;

// The WebView receives palettes over Comlink, outside React's world. This is
// the one place that boundary is crossed: messages come in here, components
// subscribe. Keeping it out of the components is what lets them stay purely
// presentational (CLAUDE.md).
let colors: DominantColor[] = [];
// The harmony the panel is currently showing, or null when the frame shows
// none. It is only ever replaced together with the colors, because it points
// *at* them by position -- a harmony from one edit over the dots of the next
// would draw a shape through the wrong corners.
let harmony: HarmonyMatch | null = null;
// When the palette below arrived, so the panel can measure what it costs to
// put it on screen rather than assume.
let receivedAt = 0;
const listeners = new Set<Listener>();

export const getPalette = (): DominantColor[] => colors;

export const getHarmony = (): HarmonyMatch | null => harmony;

export const getPaletteReceivedAt = (): number => receivedAt;

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
  if (!message || message.type !== "analysis") return;

  colors = message.payload.colors;
  harmony = message.payload.harmony;
  receivedAt = performance.now();
  for (const listener of listeners) listener();
};
