import { logger } from "../lib/logger";
import { debounce } from "../lib/debounce";
import { acquirePixels } from "./imaging";
import { listenForDocumentChanges } from "./events";
import { extractDominantColors } from "../algorithms/color-extraction";
import { detectHarmony } from "../algorithms/harmony";
import { publishAnalysis } from "./palette-publisher";
import type { DominantColor } from "../algorithms/types";

export const DEBOUNCE_MS = 400;

// What harmony detection is planned to cost per analysis. The plan says the
// arithmetic involved cannot come close to it; this is what checks that claim
// on the machine doing the retouching.
export const HARMONY_BUDGET_MS = 5;

// How long the pipeline waits for the host before looking at the document on
// its own. Photoshop has no notification for switching documents, and edits
// that never reach the history stack emit nothing either (see events.ts), so
// without a clock of its own the panel can sit on a palette from a document
// the user has already left.
export const IDLE_POLL_MS = 5000;

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

// Byte equality on the downsampled samples, which is what "the document looks
// the same" means to everything downstream of here. Cheap enough to run on
// every analysis: the buffer is a hundred pixels wide by construction.
const sameSamples = (a: Uint8Array | undefined, b: Uint8Array): boolean =>
  a !== undefined && a.length === b.length && a.every((v, i) => v === b[i]);

const analyzeDocument = async (
  isStopped: () => boolean,
  isNewFrame: (data: Uint8Array) => boolean,
): Promise<void> => {
  const acquired = await acquirePixels();
  // Undefined when there is no open document, or when the host refused the
  // read. Both are ordinary, and imaging.ts has already logged.
  if (!acquired) return;

  // Acquisition is a round trip through the host, and the panel can close
  // during it. Logging a palette for a document nobody is watching is noise
  // at best, and reads as a live panel at worst.
  if (isStopped()) return;

  // The pipeline re-reads the document on a clock, so most of what it acquires
  // is a frame it has already published. Quantizing it again would cost the
  // same as a real change, and the panel would repaint and the console fill up
  // with a palette nobody changed.
  if (!isNewFrame(acquired.data)) return;

  const start = Date.now();
  const palette = extractDominantColors(acquired.data, acquired.channels);
  const durationMs = Date.now() - start;

  logger.info(
    `Extracted ${palette.length} colors in ${durationMs}ms: ${formatPalette(palette)}`,
  );

  // Sub-millisecond by design, so the clock has to resolve better than a
  // millisecond -- Date.now would report every analysis as 0ms and the budget
  // check below would be a branch that can never be taken.
  const detectionStart = performance.now();
  const harmony = detectHarmony(palette);
  const detectionMs = performance.now() - detectionStart;
  const detectionTime = detectionMs.toFixed(2);

  logger.info(
    harmony
      ? `Harmony: ${harmony.type} across colors ${harmony.colorIndices.join(", ")} in ${detectionTime}ms`
      : `No harmony in this frame, decided in ${detectionTime}ms`,
  );
  if (detectionMs > HARMONY_BUDGET_MS)
    logger.warn(
      `Harmony detection overran its budget: ${detectionTime}ms for ${palette.length} colors`,
      { budgetMs: HARMONY_BUDGET_MS },
    );

  publishAnalysis(palette, harmony, Date.now());
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
  // Acquisition runs inside a modal scope, so two of them must not overlap.
  // The state that enforces that lives here rather than in imaging.ts for two
  // reasons: this is the layer that knows how to re-schedule what it turned
  // away, and a guard down there would be shared by every panel in the
  // session — a second one's first acquisition would disappear into a scope
  // it has nothing to do with.
  let analyzing = false;
  let changedWhileAnalyzing = false;
  // Per pipeline, like the flags above: a second panel must not be told its
  // first frame is old because another one had already seen it.
  let lastSamples: Uint8Array | undefined;

  const debouncedAcquire = debounce(() => analyze(), DEBOUNCE_MS);
  // A debounce is exactly this timer: one pending call, restarted from the
  // top on every re-arm and cancellable on teardown. Re-armed after each
  // analysis rather than run on a fixed interval, so it can only ever fire
  // after real silence instead of queueing behind a slow read.
  const pollWhenIdle = debounce(() => analyze(), IDLE_POLL_MS);

  const analyze = (): void => {
    // Cancelling on teardown only clears the timer that exists at that moment.
    // Photoshop can still deliver an event afterwards — the listener is removed
    // asynchronously, and a late-arriving one is removed later still — which
    // would schedule a fresh acquisition against a document nobody is watching.
    if (stopped) return;

    if (analyzing) {
      // The running acquisition is reading the document as it was before this
      // change, so its answer is already out of date. The host sends each
      // change once and never repeats it, so forgetting this one leaves the
      // panel wrong until the user happens to edit again.
      changedWhileAnalyzing = true;
      return;
    }

    analyzing = true;
    // Quantization is third-party code running on host-supplied bytes; a throw
    // there would surface as an unhandled rejection with no panel-side trace.
    analyzeDocument(
      () => stopped,
      (data) => {
        if (sameSamples(lastSamples, data)) return false;
        lastSamples = data;
        return true;
      },
    )
      .catch((error) => {
        logger.error("Failed to analyze the document", error as Error);
      })
      .finally(() => {
        analyzing = false;
        // Teardown cancelled both timers while this analysis was still
        // running, so re-arming either here would outlive the panel by one
        // interval — a timer nobody is left to cancel.
        if (stopped) return;
        pollWhenIdle();

        if (!changedWhileAnalyzing) return;
        changedWhileAnalyzing = false;
        // Back through the debounce instead of straight into acquisition:
        // during continuous work the changes keep arriving, and re-running at
        // once would chain analyses end to end with no pause to coalesce them.
        debouncedAcquire();
      });
  };

  const unsubscribeSafely = (unsub: () => Promise<void>) => {
    unsub().catch((error) => {
      logger.error(
        "Failed to unsubscribe from document changes",
        error as Error,
      );
    });
  };

  pollWhenIdle();

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
    // call from acquiring. This releases the timers instead of letting them
    // fire into a no-op up to an interval after the panel is gone.
    debouncedAcquire.cancel();
    pollWhenIdle.cancel();
    if (unsubscribe) unsubscribeSafely(unsubscribe);
    // React never calls a cleanup twice, but this is a module-level function
    // now rather than a closure inside an effect — a second call removing the
    // listener again would reach Photoshop with a handler it no longer knows.
    unsubscribe = undefined;
  };
};
