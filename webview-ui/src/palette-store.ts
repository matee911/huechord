import { parseBridgeMessage } from "../../src/bridge/messages";
import type {
  DominantColor,
  HarmonyMatch,
  PickedColor,
} from "../../src/algorithms/types";
import type { PanelState } from "../../src/bridge/messages";

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
// The colors the user pointed at with Photoshop's own sampler tool. Replaced
// with the palette, never on their own: they describe the same moment.
let picked: PickedColor[] = [];
// Why there is nothing to show, when that is the case. Distinct from an empty
// palette: a document full of transparent pixels also has no colors, and the
// panel should not tell the user to open one they already have open.
let state: PanelState | null = null;
const listeners = new Set<Listener>();

export const getPalette = (): DominantColor[] => colors;

export const getHarmony = (): HarmonyMatch | null => harmony;

export const getPaletteReceivedAt = (): number => receivedAt;

export const getPanelState = (): PanelState | null => state;

export const getPickedColors = (): PickedColor[] => picked;

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
  if (!message) return;

  if (message.type === "status") {
    state = message.state;
  } else if (message.type === "analysis") {
    colors = message.payload.colors;
    harmony = message.payload.harmony;
    picked = message.payload.picked;
    receivedAt = performance.now();
    // An analysis is proof a document is open, so it is the one thing that
    // clears the state -- there is no separate "never mind" message.
    state = null;
  } else return;

  for (const listener of listeners) listener();
};
