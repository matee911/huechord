import type { DominantColor, Palette } from "../algorithms/types";
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

// The most colors a palette message may carry. Deliberately a property of the
// contract rather than an import from the extractor: the WebView would then
// pull the whole quantizer into its bundle to learn one number, and a receiver
// validating against the sender's current appetite is not validating at all.
// A test pins it against what the extractor actually produces.
export const MAX_PALETTE_COLORS = 16;

export interface PaletteMessage {
  type: "palette";
  version: number;
  payload: Palette;
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

const typeOf = (value: unknown): string =>
  Array.isArray(value) ? "array" : value === null ? "null" : typeof value;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Finite, not merely `typeof "number"`: NaN and Infinity are numbers as far
// as the type check is concerned, and either one reaches the panel as a
// `cx="NaN"` or an `rgb(NaN, ...)` that renders as nothing with no error.
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isNumberTriplet = (value: unknown, keys: string[]): boolean =>
  isRecord(value) && keys.every((key) => isFiniteNumber(value[key]));

const isDominantColor = (value: unknown): value is DominantColor =>
  isRecord(value) &&
  isNumberTriplet(value.rgb, ["r", "g", "b"]) &&
  isNumberTriplet(value.hsl, ["h", "s", "l"]) &&
  isFiniteNumber(value.weight);

const reject = (reason: string, raw: unknown): null => {
  // The receiving side is the WebView, where an uncaught throw takes the whole
  // panel down. Every rejection is a log line and a null, never an exception.
  // Only the shape of the offender is logged, never its contents: the payload
  // carries colors read out of the user's image, and a rejected message is
  // exactly the case where its size is unbounded.
  logger.warn(`Discarded bridge message: ${reason}`, { received: typeOf(raw) });
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
  if (!isFiniteNumber(raw.version)) return reject("no schema version", raw);
  if (raw.version > BRIDGE_VERSION)
    return reject(`schema version ${raw.version} is from a later build`, raw);

  if (raw.type === "ready") return { type: "ready", version: raw.version };

  if (raw.type !== "palette")
    return reject(`unknown message type "${raw.type}"`, raw);

  const payload = raw.payload;
  if (!isRecord(payload)) return reject("palette has no payload", raw);
  if (!isFiniteNumber(payload.timestamp))
    return reject("palette has no timestamp", raw);
  if (!Array.isArray(payload.colors))
    return reject("palette colors are not a list", raw);
  // The extractor cannot produce more than it is asked for, so a longer list
  // did not come from it. Rendering one dot per entry for an unbounded list
  // would hang the panel, and the receiver is the only place that can say no.
  // Without a ceiling, one oversized message renders a dot per entry and hangs
  // the panel; the receiver is the only place that can refuse it.
  if (payload.colors.length > MAX_PALETTE_COLORS)
    return reject("palette holds more colors than the contract allows", raw);
  if (!payload.colors.every(isDominantColor))
    return reject("palette contains a malformed color", raw);

  return {
    type: "palette",
    version: raw.version,
    payload: { colors: payload.colors, timestamp: payload.timestamp },
  };
};
