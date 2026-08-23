import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  connectWebview,
  disconnectWebview,
  markWebviewReady,
  publishStatus,
  publishAnalysis,
} from "../uxp/palette-publisher";
import { analysisMessage, statusMessage } from "../bridge/messages";
import { setLogger, type Logger } from "../lib/logger";
import type { DominantColor } from "../algorithms/types";

const aColor = (h: number): DominantColor => ({
  rgb: { r: 10, g: 20, b: 30 },
  hsl: { h, s: 50, l: 50 },
  weight: 1,
});

let logger: Logger;

beforeEach(() => {
  logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  setLogger(logger);
});

afterEach(() => {
  disconnectWebview();
  vi.restoreAllMocks();
});

describe("palette publisher", () => {
  it("holds a palette back until the WebView reports ready", () => {
    const sink = vi.fn();
    connectWebview(sink);

    publishAnalysis([aColor(10)], null, 1);

    // The WebView is a separate browser engine with its own startup time.
    // Sending before it has a listener drops the message with no retry.
    expect(sink).not.toHaveBeenCalled();
  });

  it("delivers the buffered palette once the WebView reports ready", () => {
    const sink = vi.fn();
    connectWebview(sink);
    publishAnalysis([aColor(10)], null, 1);

    markWebviewReady();

    expect(sink).toHaveBeenCalledExactlyOnceWith(
      analysisMessage([aColor(10)], null, 1),
    );
  });

  it("delivers only the most recent palette buffered before ready", () => {
    const sink = vi.fn();
    connectWebview(sink);
    publishAnalysis([aColor(10)], null, 1);
    publishAnalysis([aColor(200)], null, 2);

    markWebviewReady();

    expect(sink).toHaveBeenCalledExactlyOnceWith(
      analysisMessage([aColor(200)], null, 2),
    );
  });

  it("delivers every palette published after ready", () => {
    const sink = vi.fn();
    connectWebview(sink);
    markWebviewReady();

    publishAnalysis([aColor(10)], null, 1);
    publishAnalysis([aColor(200)], null, 2);

    expect(sink).toHaveBeenCalledTimes(2);
    expect(sink).toHaveBeenLastCalledWith(
      analysisMessage([aColor(200)], null, 2),
    );
  });

  it("still delivers when ready arrives before the WebView is connected", () => {
    // The WebView's own handshake call and the host's Comlink wiring complete
    // independently, so neither order is guaranteed.
    markWebviewReady();
    const sink = vi.fn();
    connectWebview(sink);

    publishAnalysis([aColor(10)], null, 1);

    expect(sink).toHaveBeenCalledExactlyOnceWith(
      analysisMessage([aColor(10)], null, 1),
    );
  });

  it("survives a WebView that has gone away mid-send", () => {
    const sink = vi.fn(() => {
      throw new Error("webview is gone");
    });
    connectWebview(sink);
    markWebviewReady();

    expect(() => publishAnalysis([aColor(10)], null, 1)).not.toThrow();
    expect(logger.error).toHaveBeenCalled();
  });

  it("survives a WebView that rejects the call instead of throwing", async () => {
    // Comlink answers with a promise, so a torn-down panel arrives as a
    // rejection. Caught synchronously it would escape as an unhandled one.
    const sink = vi.fn(() => Promise.reject(new Error("webview is gone")));
    connectWebview(sink);
    markWebviewReady();

    publishAnalysis([aColor(10)], null, 1);

    await vi.waitFor(() => expect(logger.error).toHaveBeenCalled());
  });

  it("stops sending after the panel disconnects", () => {
    const sink = vi.fn();
    connectWebview(sink);
    markWebviewReady();

    disconnectWebview();
    publishAnalysis([aColor(10)], null, 1);

    expect(sink).not.toHaveBeenCalled();
  });

  it("requires a fresh handshake after a reconnect", () => {
    const first = vi.fn();
    connectWebview(first);
    markWebviewReady();
    disconnectWebview();

    // A reopened panel loads a brand new WebView document, which has not yet
    // registered its own listener — the previous handshake says nothing about it.
    const second = vi.fn();
    connectWebview(second);
    publishAnalysis([aColor(10)], null, 1);

    expect(second).not.toHaveBeenCalled();
  });

  it("sends a state the same way it sends a palette", () => {
    const sink = vi.fn();
    connectWebview(sink);
    markWebviewReady();

    publishStatus("no-document");

    expect(sink).toHaveBeenCalledExactlyOnceWith(statusMessage("no-document"));
  });

  it("holds a state back until the WebView reports ready", () => {
    const sink = vi.fn();
    connectWebview(sink);

    publishStatus("no-document");

    expect(sink).not.toHaveBeenCalled();
    markWebviewReady();
    expect(sink).toHaveBeenCalledExactlyOnceWith(statusMessage("no-document"));
  });

  // One buffer for both kinds, so whichever was published last is what the
  // panel is told. Two buffers would let a state that was already answered by
  // an analysis arrive after it and blank the wheel.
  it("delivers only the newest of a state and a palette", () => {
    const sink = vi.fn();
    connectWebview(sink);
    publishStatus("no-document");
    publishAnalysis([aColor(10)], null, 1);

    markWebviewReady();

    expect(sink).toHaveBeenCalledExactlyOnceWith(
      analysisMessage([aColor(10)], null, 1),
    );
  });
});
