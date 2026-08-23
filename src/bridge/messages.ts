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
export const BRIDGE_VERSION = 3;

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

/**
 * Whether the panel is on screen, as reported by the page inside it. Photoshop
 * announces a panel appearing but says nothing when it is closed, and the
 * plugin's React tree is never unmounted -- so the WebView noticing its own
 * `visibilitychange` is the only signal the host can act on.
 */
export interface VisibilityMessage {
  type: "visibility";
  version: number;
  visible: boolean;
}

/**
 * Everything the panel can be told that is not an analysis. There is one such
 * state today, and it exists because the panel cannot infer it: an empty
 * palette looks the same whether no document is open or an open one has
 * nothing worth calling a color.
 */
export const PANEL_STATES = ["no-document"] as const;

export type PanelState = (typeof PANEL_STATES)[number];

export interface StatusMessage {
  type: "status";
  version: number;
  state: PanelState;
}

export interface ReadyMessage {
  type: "ready";
  version: number;
}

export type BridgeMessage =
  AnalysisMessage | ReadyMessage | StatusMessage | VisibilityMessage;

export const analysisMessage = (
  colors: DominantColor[],
  harmony: HarmonyMatch | null,
  timestamp: number,
): AnalysisMessage => ({
  type: "analysis",
  version: BRIDGE_VERSION,
  payload: { colors, harmony, timestamp },
});

export const visibilityMessage = (visible: boolean): VisibilityMessage => ({
  type: "visibility",
  version: BRIDGE_VERSION,
  visible,
});

export const statusMessage = (state: PanelState): StatusMessage => ({
  type: "status",
  version: BRIDGE_VERSION,
  state,
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
// Either absent-and-null, or an object naming colors the shape runs through.
// Checked against `colorIndices` rather than against the palette: a near miss
// points at the colors to move, and one outside the shape is not that.
const isNearMiss = (value: unknown, colorIndices: number[]): boolean => {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.outlierIndices)) return false;

  const outliers = Array.from(value.outlierIndices);
  return (
    outliers.length > 0 &&
    new Set(outliers).size === outliers.length &&
    outliers.every(
      (index) =>
        isFiniteNumber(index) &&
        Number.isInteger(index) &&
        colorIndices.includes(index),
    )
  );
};

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

  if (
    !indices.every(
      (index) =>
        isFiniteNumber(index) &&
        Number.isInteger(index) &&
        index >= 0 &&
        index < colorCount,
    )
  )
    return false;

  // Monochromatic and analogous are span rules rather than templates: an arc
  // that is nearly narrow enough is just a wider arc, and there is no vertex
  // to move a color towards. ADR-009 says they cannot be near misses, and a
  // sender claiming otherwise describes a state the panel would draw as a
  // dashed shape that does not exist.
  if (expected === null && value.nearMiss !== null) return false;

  // Last, because it is checked against the indices above: a malformed shape
  // would otherwise be rejected for the wrong reason.
  return isNearMiss(value.nearMiss, indices as number[]);
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

  if (raw.type === "status") {
    // Checked against the list rather than "is a string": an unknown state
    // would reach the panel as a message it must render and cannot name.
    if (!PANEL_STATES.includes(raw.state as PanelState))
      return reject("status carries no state this build knows", raw);
    return {
      type: "status",
      version: raw.version,
      state: raw.state as PanelState,
    };
  }

  if (raw.type === "visibility") {
    // Not coerced: anything but a boolean here means the sender and this build
    // disagree about the message, and guessing which way would stop the panel
    // on a truthy string.
    if (typeof raw.visible !== "boolean")
      return reject("visibility carries no state", raw);
    return { type: "visibility", version: raw.version, visible: raw.visible };
  }

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
