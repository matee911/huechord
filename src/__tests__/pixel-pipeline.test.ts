import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const listenForDocumentChanges = vi.fn();
const acquirePixels = vi.fn();
const loggerError = vi.fn();

vi.mock("../uxp/events", () => ({
  listenForDocumentChanges: (...args: unknown[]) =>
    listenForDocumentChanges(...args),
}));
vi.mock("../uxp/imaging", () => ({
  acquirePixels: (...args: unknown[]) => acquirePixels(...args),
}));
vi.mock("../lib/logger", () => ({
  logger: { error: (...args: unknown[]) => loggerError(...args) },
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
  });

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
