import type {
  DominantColor,
  HarmonyMatch,
  HarmonyType,
} from "../algorithms/types";
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
export const BRIDGE_VERSION = 2;

// The most colors an analysis message may carry. Deliberately a property of the
// contract rather than an import from the extractor: the WebView would then
// pull the whole quantizer into its bundle to learn one number, and a receiver
// validating against the sender's current appetite is not validating at all.
// A test pins it against what the extractor actually produces.
export const MAX_PALETTE_COLORS = 16;

// Every harmony this build knows how to name and draw, and how many colors each
// one is made of. A receiver that trusted the sender's string would put an
// unrenderable name in front of the user; one that trusted the count would draw
// a four-sided "complementary" or a "square" collapsed onto a single point.
// `null` is for the two whose size genuinely varies -- an arc of neighbouring
// hues has no fixed color count.
const HARMONY_SIZES: Record<HarmonyType, number | null> = {
  complementary: 2,
  triadic: 3,
  "split-complementary": 3,
  tetradic: 4,
  square: 4,
  analogous: null,
  monochromatic: null,
};

/**
 * One analysis of one document state. Palette and harmony travel together
 * because they describe the same moment -- and here the harmony is a list of
 * positions *into* the palette, so sent apart they could not even be read.
 */
export interface Analysis {
  colors: DominantColor[];
  // Null when the frame shows no harmony, which is the ordinary case.
  harmony: HarmonyMatch | null;
  timestamp: number;
}

export interface AnalysisMessage {
  type: "analysis";
  version: number;
  payload: Analysis;
}

export interface ReadyMessage {
  type: "ready";
  version: number;
}

export type BridgeMessage = AnalysisMessage | ReadyMessage;

export const analysisMessage = (
  colors: DominantColor[],
  harmony: HarmonyMatch | null,
  timestamp: number,
): AnalysisMessage => ({
  type: "analysis",
  version: BRIDGE_VERSION,
  payload: { colors, harmony, timestamp },
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

/**
 * Checked against the palette it arrived with, not on its own: the indices are
 * read straight into the geometry that draws the shape, so one out of range is
 * a vertex at `cx="undefined"` -- a shape that silently loses a corner.
 */
const isHarmony = (
  value: unknown,
  colorCount: number,
): value is HarmonyMatch => {
  if (!isRecord(value)) return false;
  if (!Object.hasOwn(HARMONY_SIZES, value.type as string)) return false;
  // A deviation is an angle on the wheel, and half a turn is as far as two hues
  // can be from each other.
  if (
    !isFiniteNumber(value.maxDeviation) ||
    value.maxDeviation < 0 ||
    value.maxDeviation > 180
  )
    return false;
  if (!Array.isArray(value.colorIndices)) return false;

  // Copied via Array.from for the same reason the colors are indexed: a hole in
  // the array throws on the first read, and `every` walks straight past it.
  const indices = Array.from(value.colorIndices);
  const expected = HARMONY_SIZES[value.type as HarmonyType];
  if (expected === null ? indices.length < 1 : indices.length !== expected)
    return false;
  if (indices.length > colorCount) return false;
  // One color cannot occupy two corners of the same shape. Without this a
  // square arrives as four references to one dot and is drawn as a point.
  if (new Set(indices).size !== indices.length) return false;

  return indices.every(
    (index) =>
      isFiniteNumber(index) &&
      Number.isInteger(index) &&
      index >= 0 &&
      index < colorCount,
  );
};

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
    return reject("schema version is from a later build", raw);

  if (raw.type === "ready") return { type: "ready", version: raw.version };

  if (raw.type !== "analysis") return reject("unknown message type", raw);

  const payload = raw.payload;
  if (!isRecord(payload)) return reject("analysis has no payload", raw);
  if (!isFiniteNumber(payload.timestamp))
    return reject("analysis has no timestamp", raw);
  if (!Array.isArray(payload.colors))
    return reject("palette colors are not a list", raw);
  // Without a ceiling, one oversized message draws a dot per entry and takes
  // the panel with it; the receiver is the only place that can refuse it.
  if (payload.colors.length > MAX_PALETTE_COLORS)
    return reject("palette holds more colors than the contract allows", raw);
  // Indexed rather than `every`, which skips the holes in a sparse array --
  // and a hole reaching the panel throws on the first property read, which is
  // the exact failure this validation exists to prevent.
  for (let i = 0; i < payload.colors.length; i += 1)
    if (!isDominantColor(payload.colors[i]))
      return reject("palette contains a malformed color", raw);

  // Checked last, and against the palette above: ordering the harmony first
  // would reject every malformed palette as a malformed harmony, leaving the
  // palette rules asserted by nothing.
  if (
    payload.harmony !== null &&
    !isHarmony(payload.harmony, payload.colors.length)
  )
    return reject("analysis carries a malformed harmony", raw);

  return {
    type: "analysis",
    version: raw.version,
    payload: {
      colors: payload.colors,
      harmony: payload.harmony as HarmonyMatch | null,
      timestamp: payload.timestamp,
    },
  };
};
