import { logger } from "../lib/logger";
import { debounce } from "../lib/debounce";
import { acquirePixels } from "./imaging";
import { listenForDocumentChanges } from "./events";
import { extractDominantColors } from "../algorithms/color-extraction";
import { publishPalette } from "./palette-publisher";
import type { DominantColor } from "../algorithms/types";

export const DEBOUNCE_MS = 400;

// Values are cut down before logging: this line is read by a human in the UDT
// console, and a palette at full float precision is not something a human
// reads. The angle and the percentages round to whole units; the weight keeps
// enough places to tell a dominant color from a trace one.
const formatPalette = (palette: DominantColor[]): string =>
  JSON.stringify(
    palette.map(({ rgb, hsl, weight }) => ({
      ...rgb,
      h: Math.round(hsl.h),
      s: Math.round(hsl.s),
      l: Math.round(hsl.l),
      weight: Number(weight.toFixed(3)),
    })),
  );

const analyzeDocument = async (isStopped: () => boolean): Promise<void> => {
  const acquired = await acquirePixels();
  // Undefined when there is no open document, or when an acquisition is
  // already in flight. Both are ordinary, and imaging.ts has already logged.
  if (!acquired) return;

  // Acquisition is a round trip through the host, and the panel can close
  // during it. Logging a palette for a document nobody is watching is noise
  // at best, and reads as a live panel at worst.
  if (isStopped()) return;

  const start = Date.now();
  const palette = extractDominantColors(acquired.data, acquired.channels);
  const durationMs = Date.now() - start;

  logger.info(
    `Extracted ${palette.length} colors in ${durationMs}ms: ${formatPalette(palette)}`,
  );

  publishPalette(palette, Date.now());
};

/**
 * Wires document changes to debounced pixel acquisition and hands back the
 * teardown. It lives outside the React component so the wiring — and above all
 * its teardown paths — can be tested in the Node environment the rest of the
 * suite runs in, instead of pulling in a DOM to mount a panel.
 */
export const startPixelPipeline = (): (() => void) => {
  // Teardown can run before the subscription resolves (unmount, StrictMode's
  // double-invoke, a quick panel close/reopen). Without the flag the listener
  // registers a moment later and is never removed, so it keeps driving
  // acquisition for the rest of the session and stacks up on every restart.
  let stopped = false;
  let unsubscribe: (() => Promise<void>) | undefined;

  const debouncedAcquire = debounce(() => {
    // Cancelling on teardown only clears the timer that exists at that moment.
    // Photoshop can still deliver an event afterwards — the listener is removed
    // asynchronously, and a late-arriving one is removed later still — which
    // would schedule a fresh acquisition against a document nobody is watching.
    if (stopped) return;
    // Quantization is third-party code running on host-supplied bytes; a throw
    // there would surface as an unhandled rejection with no panel-side trace.
    analyzeDocument(() => stopped).catch((error) => {
      logger.error("Failed to analyze the document", error as Error);
    });
  }, DEBOUNCE_MS);

  const unsubscribeSafely = (unsub: () => Promise<void>) => {
    unsub().catch((error) => {
      logger.error(
        "Failed to unsubscribe from document changes",
        error as Error,
      );
    });
  };

  listenForDocumentChanges(debouncedAcquire)
    .then((unsub) => {
      if (stopped) unsubscribeSafely(unsub);
      else unsubscribe = unsub;
    })
    .catch((error) => {
      logger.error("Failed to subscribe to document changes", error as Error);
    });

  return () => {
    stopped = true;
    // Housekeeping, not correctness: the flag above already stops a pending
    // call from acquiring. This releases the timer instead of letting it fire
    // into a no-op up to a debounce interval after the panel is gone.
    debouncedAcquire.cancel();
    if (unsubscribe) unsubscribeSafely(unsubscribe);
    // React never calls a cleanup twice, but this is a module-level function
    // now rather than a closure inside an effect — a second call removing the
    // listener again would reach Photoshop with a handler it no longer knows.
    unsubscribe = undefined;
  };
};
