import type { DominantColor } from "../algorithms/types";
import { logger } from "../lib/logger";

/**
 * The wire contract between the UXP context and the WebView. Both sides import
 * this module rather than restating the shape, so sender and receiver cannot
 * drift apart. It must stay free of UXP APIs, React and the DOM — importing it
 * has to be safe from either context.
 */

// Bumped when an existing variant's shape changes in a way an older receiver
// would misread. Adding a new `type` does not need a bump; the discriminant
// already tells an older receiver it doesn't know the message.
export const BRIDGE_VERSION = 1;

export interface PaletteMessage {
  type: "palette";
  version: number;
  payload: {
    colors: DominantColor[];
    timestamp: number;
  };
}

export interface ReadyMessage {
  type: "ready";
  version: number;
}

export type BridgeMessage = PaletteMessage | ReadyMessage;

export const paletteMessage = (
  colors: DominantColor[],
  timestamp: number,
): PaletteMessage => ({
  type: "palette",
  version: BRIDGE_VERSION,
  payload: { colors, timestamp },
});

export const readyMessage = (): ReadyMessage => ({
  type: "ready",
  version: BRIDGE_VERSION,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNumberTriplet = (value: unknown, keys: string[]): boolean =>
  isRecord(value) && keys.every((key) => typeof value[key] === "number");

const isDominantColor = (value: unknown): value is DominantColor =>
  isRecord(value) &&
  isNumberTriplet(value.rgb, ["r", "g", "b"]) &&
  isNumberTriplet(value.hsl, ["h", "s", "l"]) &&
  typeof value.weight === "number";

const reject = (reason: string, raw: unknown): null => {
  // The receiving side is the WebView, where an uncaught throw takes the whole
  // panel down. Every rejection is a log line and a null, never an exception.
  logger.warn(`Discarded bridge message: ${reason}`, { raw });
  return null;
};

/**
 * Validates anything arriving over the bridge before it reaches the UI.
 * Returns `null` for anything this build does not understand — malformed
 * input, an unknown variant, or a message from a later schema version.
 */
export const parseBridgeMessage = (raw: unknown): BridgeMessage | null => {
  if (!isRecord(raw)) return reject("not an object", raw);
  if (typeof raw.type !== "string") return reject("no message type", raw);
  if (typeof raw.version !== "number") return reject("no schema version", raw);
  if (raw.version > BRIDGE_VERSION)
    return reject(`schema version ${raw.version} is from a later build`, raw);

  if (raw.type === "ready") return { type: "ready", version: raw.version };

  if (raw.type !== "palette")
    return reject(`unknown message type "${raw.type}"`, raw);

  const payload = raw.payload;
  if (!isRecord(payload)) return reject("palette has no payload", raw);
  if (typeof payload.timestamp !== "number")
    return reject("palette has no timestamp", raw);
  if (!Array.isArray(payload.colors))
    return reject("palette colors are not a list", raw);
  if (!payload.colors.every(isDominantColor))
    return reject("palette contains a malformed color", raw);

  return {
    type: "palette",
    version: raw.version,
    payload: { colors: payload.colors, timestamp: payload.timestamp },
  };
};
