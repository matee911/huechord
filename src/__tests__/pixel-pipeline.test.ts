import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const listenForDocumentChanges = vi.fn();
const acquirePixels = vi.fn();
const loggerError = vi.fn();
const loggerInfo = vi.fn();

vi.mock("../uxp/events", () => ({
  listenForDocumentChanges: (...args: unknown[]) =>
    listenForDocumentChanges(...args),
}));
vi.mock("../uxp/imaging", () => ({
  acquirePixels: (...args: unknown[]) => acquirePixels(...args),
}));
vi.mock("../lib/logger", () => ({
  logger: {
    error: (...args: unknown[]) => loggerError(...args),
    info: (...args: unknown[]) => loggerInfo(...args),
  },
}));

const { startPixelPipeline, DEBOUNCE_MS } =
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
    loggerInfo.mockReset();
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

    await vi.waitFor(() => expect(loggerInfo).toHaveBeenCalledTimes(1));
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

  it("reports a failed analysis instead of raising an unhandled rejection", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    listenForDocumentChanges.mockResolvedValue(unsubscribe);
    acquirePixels.mockRejectedValue(new Error("host went away"));

    startPixelPipeline();
    await vi.waitFor(() => expect(listenForDocumentChanges).toHaveBeenCalled());

    notifyDocumentChange();
    vi.advanceTimersByTime(DEBOUNCE_MS);

    await vi.waitFor(() => expect(loggerError).toHaveBeenCalledTimes(1));
    expect(loggerError.mock.calls[0][0]).toContain("Failed to analyze");
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
