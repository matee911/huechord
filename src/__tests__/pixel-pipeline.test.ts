import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const listenForDocumentChanges = vi.fn();
const acquirePixels = vi.fn();
const loggerError = vi.fn();
const loggerInfo = vi.fn();
const publishAnalysis = vi.fn();
const publishStatus = vi.fn();
const hasOpenDocument = vi.fn(() => true);
const readPickedColors = vi.fn(() => [] as unknown[]);
const loggerWarn = vi.fn();

vi.mock("../uxp/events", () => ({
  listenForDocumentChanges: (...args: unknown[]) =>
    listenForDocumentChanges(...args),
}));
vi.mock("../uxp/imaging", () => ({
  acquirePixels: (...args: unknown[]) => acquirePixels(...args),
}));
vi.mock("../uxp/palette-publisher", () => ({
  publishAnalysis: (...args: unknown[]) => publishAnalysis(...args),
  publishStatus: (...args: unknown[]) => publishStatus(...args),
}));
vi.mock("../uxp/document-state", () => ({
  hasOpenDocument: () => hasOpenDocument(),
}));
vi.mock("../uxp/color-samplers", () => ({
  readPickedColors: () => readPickedColors(),
}));
vi.mock("../lib/logger", () => ({
  logger: {
    error: (...args: unknown[]) => loggerError(...args),
    info: (...args: unknown[]) => loggerInfo(...args),
    warn: (...args: unknown[]) => loggerWarn(...args),
  },
}));

const { startPixelPipeline, DEBOUNCE_MS, HARMONY_BUDGET_MS, IDLE_POLL_MS } =
  await import("../uxp/pixel-pipeline");

// Hands back the promise the pipeline awaits plus its resolve/reject, so a test
// can decide *when* the subscription settles — that timing is the whole point
// of the teardown cases below.
const deferredSubscription = () => {
  let settle!: (unsubscribe: () => Promise<void>) => void;
  let fail!: (error: Error) => void;
  const promise = new Promise<() => Promise<void>>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  listenForDocumentChanges.mockReturnValue(promise);
  return { settle, fail };
};

const notifyDocumentChange = () => {
  const onChange = listenForDocumentChanges.mock.calls[0][0] as () => void;
  onChange();
};

describe("startPixelPipeline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    listenForDocumentChanges.mockReset();
    acquirePixels.mockReset().mockResolvedValue(undefined);
    loggerError.mockReset();
    loggerWarn.mockReset();
    loggerInfo.mockReset();
    publishAnalysis.mockReset();
    publishStatus.mockReset();
    hasOpenDocument.mockReset().mockReturnValue(true);
    readPickedColors.mockReset().mockReturnValue([]);
  });

  // Real extraction runs here rather than a mock: the point of the assertion is
  // that the two halves fit together, not that the pipeline calls a function.
  const acquisitionYields = (pixels: number[][]) => {
    acquirePixels.mockResolvedValue({
      pixelCount: pixels.length,
      durationMs: 1,
      data: Uint8Array.from(pixels.flat()),
      channels: 4,
    });
  };

  afterEach(() => {
    vi.useRealTimers();
    // The budget test stubs the clock. Left in place it advances 10ms on every
    // read for the rest of the file, which is a failure nobody would connect
    // back to here.
    vi.restoreAllMocks();
  });

  it("acquires pixels once for a burst of document changes", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    listenForDocumentChanges.mockResolvedValue(unsubscribe);

    startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());

    notifyDocumentChange();
    notifyDocumentChange();
    expect(acquirePixels).not.toHaveBeenCalled();

    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(acquirePixels).toHaveBeenCalledTimes(1);
  });

  // Asserts the message itself: the Definition of Done for this step is that a
  // retoucher sees the palette in the console, which a silently-correct return
  // value would not deliver.
  it("logs the extracted palette after a document change", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    listenForDocumentChanges.mockResolvedValue(unsubscribe);
    acquisitionYields([
      ...Array.from({ length: 30 }, () => [255, 0, 0, 255]),
      ...Array.from({ length: 10 }, () => [0, 0, 255, 255]),
    ]);

    startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());

    notifyDocumentChange();
    vi.advanceTimersByTime(DEBOUNCE_MS);

    await vi.waitFor(() => expect(loggerInfo).toHaveBeenCalled());
    const [message] = loggerInfo.mock.calls[0] as [string];
    expect(message).toMatch(/^Extracted 2 colors in \d+ms: /);

    // Channel values are the quantizer's cluster averages and land a few units
    // off the input, so asserting them exactly would pin down an artifact.
    // Hue and weight are what the line has to get right.
    const logged = JSON.parse(message.slice(message.indexOf(": ") + 2));
    expect(logged).toEqual([
      expect.objectContaining({ h: 0, weight: 0.75 }),
      expect.objectContaining({ h: 240, weight: 0.25 }),
    ]);
    expect(logged[0]).toEqual({
      r: expect.any(Number),
      g: expect.any(Number),
      b: expect.any(Number),
      h: expect.any(Number),
      s: expect.any(Number),
      l: expect.any(Number),
      weight: expect.any(Number),
    });
  });

  // The console line above is for whoever is debugging; this is what the panel
  // actually draws, so the two are asserted separately.
  it("publishes the extracted palette to the WebView", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    listenForDocumentChanges.mockResolvedValue(unsubscribe);
    acquisitionYields([
      ...Array.from({ length: 30 }, () => [255, 0, 0, 255]),
      ...Array.from({ length: 10 }, () => [0, 0, 255, 255]),
    ]);

    startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());

    notifyDocumentChange();
    vi.advanceTimersByTime(DEBOUNCE_MS);

    await vi.waitFor(() => expect(publishAnalysis).toHaveBeenCalledTimes(1));
    const [colors, harmony, , timestamp] = publishAnalysis.mock.calls[0] as [
      { hsl: { h: number }; weight: number }[],
      { type: string } | null,
      unknown,
      number,
    ];
    expect(colors.map(({ hsl, weight }) => [hsl.h, weight])).toEqual([
      [0, 0.75],
      [240, 0.25],
    ]);
    // The palette and the harmony detected from it cross the bridge in one
    // call, and the harmony indexes that very palette.
    expect(harmony).toBeNull();
    expect(timestamp).toEqual(expect.any(Number));
  });

  it("publishes the harmony it detected together with the palette", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    listenForDocumentChanges.mockResolvedValue(unsubscribe);
    acquisitionYields([
      ...Array.from({ length: 20 }, () => [255, 0, 0, 255]),
      ...Array.from({ length: 20 }, () => [0, 255, 255, 255]),
    ]);

    startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());

    notifyDocumentChange();
    vi.advanceTimersByTime(DEBOUNCE_MS);

    await vi.waitFor(() => expect(publishAnalysis).toHaveBeenCalledTimes(1));
    const [, harmony] = publishAnalysis.mock.calls[0] as [
      unknown,
      { type: string; colorIndices: number[] },
    ];
    expect(harmony).toMatchObject({ type: "complementary" });
    expect(harmony.colorIndices).toHaveLength(2);
    await vi.waitFor(() =>
      expect(loggerInfo).toHaveBeenCalledWith(
        expect.stringMatching(
          /Harmony: complementary across colors 0, 1 in \d+\.\d+ms/,
        ),
      ),
    );
    expect(loggerWarn).not.toHaveBeenCalled();
  });

  // The console is where this is debugged, and a bare type there reads as a
  // firm answer to a frame the panel is hedging about.
  it("says in the log when the frame is only close to a harmony", async () => {
    listenForDocumentChanges.mockResolvedValue(
      vi.fn().mockResolvedValue(undefined),
    );
    // Split-complementary arms are 0/150/210; the third color is 25 degrees
    // past its own, which is a near miss rather than a shape.
    acquisitionYields([
      ...Array.from({ length: 20 }, () => [240, 0, 0, 255]),
      ...Array.from({ length: 20 }, () => [0, 240, 120, 255]),
      ...Array.from({ length: 20 }, () => [0, 20, 240, 255]),
    ]);

    startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());
    notifyDocumentChange();
    vi.advanceTimersByTime(DEBOUNCE_MS);

    await vi.waitFor(() =>
      expect(loggerInfo).toHaveBeenCalledWith(
        expect.stringContaining("Harmony: close to split-complementary"),
      ),
    );
  });

  it("says so when detection overran its budget", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    listenForDocumentChanges.mockResolvedValue(unsubscribe);
    acquisitionYields(Array.from({ length: 40 }, () => [255, 0, 0, 255]));

    // Detection is far too cheap to overrun on its own, so the clock is what
    // moves. Without this the budget line is only ever asserted to stay quiet,
    // which is the half that also passes when the warning is broken.
    let reading = 0;
    vi.spyOn(performance, "now").mockImplementation(() => {
      reading += HARMONY_BUDGET_MS * 2;
      return reading;
    });

    startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());

    notifyDocumentChange();
    vi.advanceTimersByTime(DEBOUNCE_MS);

    await vi.waitFor(() =>
      expect(loggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("Harmony detection overran its budget"),
        expect.objectContaining({ budgetMs: HARMONY_BUDGET_MS }),
      ),
    );
  });

  // Driven through the logger rather than through acquisition: acquirePixels
  // swallows its own errors and resolves undefined, so it cannot be the thing
  // that rejects. What this pins is that a throw anywhere downstream of it --
  // quantization on host-supplied bytes being the real candidate -- is reported
  // rather than escaping as an unhandled rejection.
  it("reports a failed analysis instead of raising an unhandled rejection", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    listenForDocumentChanges.mockResolvedValue(unsubscribe);
    acquisitionYields([[255, 0, 0, 255]]);
    loggerInfo.mockImplementation(() => {
      throw new Error("console detached");
    });

    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    try {
      startPixelPipeline();
      await vi.waitFor(() =>
        expect(listenForDocumentChanges).toHaveBeenCalled(),
      );

      notifyDocumentChange();
      vi.advanceTimersByTime(DEBOUNCE_MS);

      await vi.waitFor(() => expect(loggerError).toHaveBeenCalledTimes(1));
      expect(loggerError.mock.calls[0][0]).toContain("Failed to analyze");

      vi.useRealTimers();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  // Acquisition is a round trip through the host and the panel can close
  // mid-flight. Without the check the palette still reaches the console, which
  // reads as a panel that is somehow still watching.
  it("does not log a palette for a pipeline stopped mid-acquisition", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    listenForDocumentChanges.mockResolvedValue(unsubscribe);

    let finishAcquisition!: (result: unknown) => void;
    acquirePixels.mockReturnValue(
      new Promise((resolve) => {
        finishAcquisition = resolve;
      }),
    );

    const stop = startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());

    notifyDocumentChange();
    vi.advanceTimersByTime(DEBOUNCE_MS);
    await vi.waitFor(() => expect(acquirePixels).toHaveBeenCalledTimes(1));

    stop();
    finishAcquisition({
      pixelCount: 1,
      durationMs: 1,
      data: Uint8Array.from([255, 0, 0, 255]),
      channels: 4,
    });

    vi.useRealTimers();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loggerInfo).not.toHaveBeenCalled();
  });

  // A held-open acquisition, so a test can decide when the pipeline is busy.
  const acquisitionHangs = () => {
    let finish!: (result: unknown) => void;
    acquirePixels.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    return () =>
      finish({
        pixelCount: 1,
        durationMs: 1,
        data: Uint8Array.from([255, 0, 0, 255]),
        channels: 4,
      });
  };

  // The host sends each change once. One that arrives while the pipeline is
  // busy describes a document the running acquisition is not looking at, so
  // dropping it leaves the panel on colors that are already gone -- and nothing
  // will say so until the user happens to edit again.
  it("re-analyzes a change that arrived mid-acquisition", async () => {
    listenForDocumentChanges.mockResolvedValue(
      vi.fn().mockResolvedValue(undefined),
    );
    const finishAcquisition = acquisitionHangs();

    startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());

    notifyDocumentChange();
    vi.advanceTimersByTime(DEBOUNCE_MS);
    await vi.waitFor(() => expect(acquirePixels).toHaveBeenCalledTimes(1));

    notifyDocumentChange();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    // Not a second acquisition on top of the first: getPixels only runs inside
    // a modal scope, and two of those overlapping is exactly what the guard
    // this replaces was protecting the host from.
    expect(acquirePixels).toHaveBeenCalledTimes(1);

    finishAcquisition();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(acquirePixels).toHaveBeenCalledTimes(2);
  });

  // The re-run is owed to a change, not to the acquisition finishing. Without
  // this the pipeline would chase its own tail on an idle document.
  it("does not re-analyze when nothing changed during the acquisition", async () => {
    listenForDocumentChanges.mockResolvedValue(
      vi.fn().mockResolvedValue(undefined),
    );
    const finishAcquisition = acquisitionHangs();

    startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());

    notifyDocumentChange();
    vi.advanceTimersByTime(DEBOUNCE_MS);
    await vi.waitFor(() => expect(acquirePixels).toHaveBeenCalledTimes(1));

    finishAcquisition();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(acquirePixels).toHaveBeenCalledTimes(1);
  });

  // Switching documents, and any edit that never reaches the history stack,
  // emit no notification at all -- the panel would show the previous
  // document's palette indefinitely with nothing to trigger a correction.
  it("re-analyzes on its own when the host sends no events", async () => {
    listenForDocumentChanges.mockResolvedValue(
      vi.fn().mockResolvedValue(undefined),
    );

    startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());

    await vi.advanceTimersByTimeAsync(IDLE_POLL_MS);
    expect(acquirePixels).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(IDLE_POLL_MS);
    expect(acquirePixels).toHaveBeenCalledTimes(2);
  });

  // The poll is a timer the pipeline owns, so teardown has to reach it too --
  // otherwise a closed panel keeps opening modal scopes on the user's document
  // every few seconds for the rest of the session.
  it("stops polling once the pipeline is stopped", async () => {
    listenForDocumentChanges.mockResolvedValue(
      vi.fn().mockResolvedValue(undefined),
    );

    const stop = startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());

    stop();

    // The timer itself, not just its effect: analyze() bails on a stopped
    // pipeline anyway, so asserting only that nothing was acquired would pass
    // just as happily with the poll left armed.
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(IDLE_POLL_MS * 3);
    expect(acquirePixels).not.toHaveBeenCalled();
  });

  // The poll re-reads the document on a clock, so most of what it acquires is
  // a frame already on screen. Publishing it again repaints the panel and
  // writes another palette to the console for a document nobody touched.
  it("stays quiet when the poll finds the document unchanged", async () => {
    listenForDocumentChanges.mockResolvedValue(
      vi.fn().mockResolvedValue(undefined),
    );
    acquisitionYields([
      ...Array.from({ length: 30 }, () => [255, 0, 0, 255]),
      ...Array.from({ length: 10 }, () => [0, 0, 255, 255]),
    ]);

    startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());

    await vi.advanceTimersByTimeAsync(IDLE_POLL_MS);
    expect(publishAnalysis).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(IDLE_POLL_MS);
    await vi.advanceTimersByTimeAsync(IDLE_POLL_MS);
    expect(acquirePixels).toHaveBeenCalledTimes(3);
    expect(publishAnalysis).toHaveBeenCalledTimes(1);
    expect(loggerInfo).toHaveBeenCalledTimes(2);
  });

  // Quiet must mean "nothing new", not "nothing again": a document that goes
  // back to a palette it showed before still has to reach the panel.
  it("publishes a frame that differs from the one before it", async () => {
    listenForDocumentChanges.mockResolvedValue(
      vi.fn().mockResolvedValue(undefined),
    );
    acquisitionYields(Array.from({ length: 40 }, () => [255, 0, 0, 255]));

    startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());

    await vi.advanceTimersByTimeAsync(IDLE_POLL_MS);
    expect(publishAnalysis).toHaveBeenCalledTimes(1);

    acquisitionYields(Array.from({ length: 40 }, () => [0, 0, 255, 255]));
    notifyDocumentChange();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(publishAnalysis).toHaveBeenCalledTimes(2);
  });

  // A change that lands mid-acquisition is remembered, and the memory must not
  // outlive the panel: re-running after teardown analyzes a document nobody is
  // watching.
  it("drops a mid-acquisition change when the pipeline is stopped", async () => {
    listenForDocumentChanges.mockResolvedValue(
      vi.fn().mockResolvedValue(undefined),
    );
    const finishAcquisition = acquisitionHangs();

    const stop = startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());

    notifyDocumentChange();
    vi.advanceTimersByTime(DEBOUNCE_MS);
    await vi.waitFor(() => expect(acquirePixels).toHaveBeenCalledTimes(1));

    notifyDocumentChange();
    stop();
    finishAcquisition();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(acquirePixels).toHaveBeenCalledTimes(1);
  });

  // Two live pipelines are ordinary -- a quick panel close/reopen, or
  // StrictMode's double-invoke. While the in-flight state was module-level they
  // shared one guard, so whichever started second lost its first acquisition.
  it("lets a second pipeline acquire while the first one is busy", async () => {
    listenForDocumentChanges.mockResolvedValue(
      vi.fn().mockResolvedValue(undefined),
    );
    acquisitionHangs();

    startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());
    notifyDocumentChange();
    vi.advanceTimersByTime(DEBOUNCE_MS);
    await vi.waitFor(() => expect(acquirePixels).toHaveBeenCalledTimes(1));

    startPixelPipeline();
    await vi.waitFor(() =>
      expect(listenForDocumentChanges).toHaveBeenCalledTimes(2),
    );
    const notifySecond = listenForDocumentChanges.mock
      .calls[1][0] as () => void;
    notifySecond();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(acquirePixels).toHaveBeenCalledTimes(2);
  });

  // Asked before acquiring: with nothing open the read enters a modal scope
  // only to be refused, which used to write a stack trace to the console every
  // five seconds for as long as the panel stayed open.
  it("does not ask the host for pixels when no document is open", async () => {
    listenForDocumentChanges.mockResolvedValue(
      vi.fn().mockResolvedValue(undefined),
    );
    hasOpenDocument.mockReturnValue(false);

    startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(IDLE_POLL_MS);

    expect(acquirePixels).not.toHaveBeenCalled();
    expect(publishStatus).toHaveBeenCalledWith("no-document");
  });

  // The panel cannot work this out for itself: an all-transparent document
  // also yields nothing, and it must not tell the user to open a document
  // they already have open.
  it("tells the panel once a document is there again", async () => {
    listenForDocumentChanges.mockResolvedValue(
      vi.fn().mockResolvedValue(undefined),
    );
    acquisitionYields(Array.from({ length: 40 }, () => [255, 0, 0, 255]));
    hasOpenDocument.mockReturnValue(false);

    startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(IDLE_POLL_MS);

    hasOpenDocument.mockReturnValue(true);
    notifyDocumentChange();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(publishAnalysis).toHaveBeenCalledTimes(1);
  });

  // The colors the user pointed at ride along with the palette: sent in a
  // message of their own they could arrive a frame out of step, and the panel
  // would ring a document that has moved on.
  it("sends the picked colors with the palette", async () => {
    listenForDocumentChanges.mockResolvedValue(
      vi.fn().mockResolvedValue(undefined),
    );
    acquisitionYields(Array.from({ length: 40 }, () => [255, 0, 0, 255]));
    const picked = [{ rgb: { r: 1, g: 2, b: 3 }, hsl: { h: 4, s: 5, l: 6 } }];
    readPickedColors.mockReturnValue(picked);

    startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());
    notifyDocumentChange();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(publishAnalysis).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      picked,
      expect.any(Number),
    );
  });

  // The AC says a picked point never completes a harmony. It is true by
  // construction -- detectHarmony is handed the palette and PickedColor has no
  // weight to be weighed -- and a claim nothing checks is a claim that quietly
  // stops being true.
  it("does not let a picked point complete a harmony", async () => {
    listenForDocumentChanges.mockResolvedValue(
      vi.fn().mockResolvedValue(undefined),
    );
    // Two hues 120 apart: a third at 240 would make a triad, and the picked
    // point below is exactly that color.
    acquisitionYields([
      ...Array.from({ length: 20 }, () => [255, 0, 0, 255]),
      ...Array.from({ length: 20 }, () => [0, 255, 0, 255]),
    ]);
    readPickedColors.mockReturnValue([
      { rgb: { r: 0, g: 0, b: 255 }, hsl: { h: 240, s: 100, l: 50 } },
    ]);

    startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());
    notifyDocumentChange();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    const [colors, harmony, picked] = publishAnalysis.mock.calls[0] as [
      unknown[],
      { type: string; colorIndices: number[] } | null,
      unknown[],
    ];
    // Two hues 120 apart are no harmony on their own, and the third color the
    // triad would need is on the wheel -- as a ring, which detection cannot see.
    expect(harmony).toBeNull();
    expect(colors).toHaveLength(2);
    expect(picked).toHaveLength(1);
  });

  // Moving a sampler changes no pixel, so the dedupe that keeps the idle poll
  // quiet would also keep the ring pinned where the marker used to be.
  it("republishes when only the picked colors changed", async () => {
    listenForDocumentChanges.mockResolvedValue(
      vi.fn().mockResolvedValue(undefined),
    );
    acquisitionYields(Array.from({ length: 40 }, () => [255, 0, 0, 255]));

    startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(IDLE_POLL_MS);
    expect(publishAnalysis).toHaveBeenCalledTimes(1);

    readPickedColors.mockReturnValue([
      { rgb: { r: 9, g: 9, b: 9 }, hsl: { h: 0, s: 0, l: 4 } },
    ]);
    await vi.advanceTimersByTimeAsync(IDLE_POLL_MS);

    expect(publishAnalysis).toHaveBeenCalledTimes(2);
  });

  // The bug this exists for: reopening the same document produces the very same
  // hundred pixels, so a remembered frame matches them, the publish is skipped
  // and the panel keeps telling the user to open a document they are looking at.
  it("publishes again when the same document comes back", async () => {
    listenForDocumentChanges.mockResolvedValue(
      vi.fn().mockResolvedValue(undefined),
    );
    acquisitionYields(Array.from({ length: 40 }, () => [255, 0, 0, 255]));

    startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(IDLE_POLL_MS);
    expect(publishAnalysis).toHaveBeenCalledTimes(1);

    hasOpenDocument.mockReturnValue(false);
    await vi.advanceTimersByTimeAsync(IDLE_POLL_MS);
    expect(publishStatus).toHaveBeenCalledWith("no-document");

    hasOpenDocument.mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(IDLE_POLL_MS);

    expect(publishAnalysis).toHaveBeenCalledTimes(2);
  });

  // The poll keeps running for as long as Photoshop is left empty, and the
  // panel is already showing it.
  it("says there is no document once, not on every tick", async () => {
    listenForDocumentChanges.mockResolvedValue(
      vi.fn().mockResolvedValue(undefined),
    );
    hasOpenDocument.mockReturnValue(false);

    startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(IDLE_POLL_MS * 3);

    expect(publishStatus).toHaveBeenCalledTimes(1);
  });

  it("says it again after a document has been and gone", async () => {
    listenForDocumentChanges.mockResolvedValue(
      vi.fn().mockResolvedValue(undefined),
    );
    acquisitionYields(Array.from({ length: 40 }, () => [255, 0, 0, 255]));
    hasOpenDocument.mockReturnValue(false);

    startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(IDLE_POLL_MS);

    hasOpenDocument.mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(IDLE_POLL_MS);
    hasOpenDocument.mockReturnValue(false);
    await vi.advanceTimersByTimeAsync(IDLE_POLL_MS);

    expect(publishStatus).toHaveBeenCalledTimes(2);
  });

  it("removes the listener when stopped after the subscription resolved", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    listenForDocumentChanges.mockResolvedValue(unsubscribe);

    const stop = startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());

    stop();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("removes the listener only once when stopped twice", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    listenForDocumentChanges.mockResolvedValue(unsubscribe);

    const stop = startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());

    stop();
    stop();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("removes the listener that arrives after the pipeline was stopped", async () => {
    const { settle } = deferredSubscription();
    const unsubscribe = vi.fn().mockResolvedValue(undefined);

    const stop = startPixelPipeline();
    stop();
    settle(unsubscribe);

    await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1));

    // Photoshop can still deliver an event between the listener arriving and
    // the removal landing, so the debounced call has to stay cancelled too —
    // removing the listener alone would not keep this quiet.
    notifyDocumentChange();
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(acquirePixels).not.toHaveBeenCalled();
  });

  it("does not acquire pixels for a change still pending when stopped", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    listenForDocumentChanges.mockResolvedValue(unsubscribe);

    const stop = startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());

    notifyDocumentChange();
    stop();
    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(acquirePixels).not.toHaveBeenCalled();
  });

  it("logs a failed subscription instead of raising an unhandled rejection", async () => {
    const { fail } = deferredSubscription();
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    try {
      startPixelPipeline();
      fail(new Error("no host"));

      await vi.waitFor(() => expect(loggerError).toHaveBeenCalledTimes(1));
      expect(loggerError.mock.calls[0][0]).toContain("Failed to subscribe");

      // Rejections are reported a macrotask after they settle, so let the real
      // event loop turn before asserting nothing was reported.
      vi.useRealTimers();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      // A failing assertion above would otherwise leave this listener attached
      // for the rest of the process, where it silently watches every later test.
      process.off("unhandledRejection", unhandled);
    }
  });

  // Photoshop 27.9.1 returns undefined from removeNotificationListener, even
  // though its own declarations promise a Promise. Reaching for .catch on that
  // throws, and the throw surfaces to whoever asked for the teardown.
  it("tolerates an unsubscribe that returns nothing", async () => {
    const unsubscribe = vi.fn(() => undefined as unknown as Promise<void>);
    listenForDocumentChanges.mockResolvedValue(unsubscribe);

    const stop = startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());

    expect(() => stop()).not.toThrow();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(loggerError).not.toHaveBeenCalled();
  });

  // Teardown runs when the panel closes now, and the call that removes the
  // listener reaches the host. A synchronous throw there would escape the
  // teardown entirely -- out through whoever asked for it, which is a Comlink
  // call from the WebView.
  it("logs an unsubscribe that throws synchronously", async () => {
    const unsubscribe = vi.fn(() => {
      throw new Error("gone");
    });
    listenForDocumentChanges.mockResolvedValue(unsubscribe);

    const stop = startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());

    expect(() => stop()).not.toThrow();
    expect(loggerError).toHaveBeenCalledTimes(1);
    expect(loggerError.mock.calls[0][0]).toContain("Failed to unsubscribe");
  });

  it("logs a failed unsubscribe", async () => {
    const unsubscribe = vi.fn().mockRejectedValue(new Error("gone"));
    listenForDocumentChanges.mockResolvedValue(unsubscribe);

    const stop = startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());

    stop();

    await vi.waitFor(() => expect(loggerError).toHaveBeenCalledTimes(1));
    expect(loggerError.mock.calls[0][0]).toContain("Failed to unsubscribe");
  });
});
