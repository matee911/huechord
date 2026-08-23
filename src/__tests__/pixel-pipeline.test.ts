import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const listenForDocumentChanges = vi.fn();
const acquirePixels = vi.fn();
const loggerError = vi.fn();
const loggerInfo = vi.fn();
const publishAnalysis = vi.fn();
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
    const [colors, harmony, timestamp] = publishAnalysis.mock.calls[0] as [
      { hsl: { h: number }; weight: number }[],
      { type: string } | null,
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
    await vi.advanceTimersByTimeAsync(IDLE_POLL_MS * 3);

    expect(acquirePixels).not.toHaveBeenCalled();
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
