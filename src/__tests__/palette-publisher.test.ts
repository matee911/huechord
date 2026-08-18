import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  connectWebview,
  disconnectWebview,
  handleWebviewMessage,
  publishPalette,
} from "../uxp/palette-publisher";
import { paletteMessage, readyMessage } from "../bridge/messages";
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

    publishPalette([aColor(10)], 1);

    // The WebView is a separate browser engine with its own startup time.
    // Sending before it has a listener drops the message with no retry.
    expect(sink).not.toHaveBeenCalled();
  });

  it("delivers the buffered palette once the WebView reports ready", () => {
    const sink = vi.fn();
    connectWebview(sink);
    publishPalette([aColor(10)], 1);

    handleWebviewMessage(readyMessage());

    expect(sink).toHaveBeenCalledExactlyOnceWith(
      paletteMessage([aColor(10)], 1),
    );
  });

  it("delivers only the most recent palette buffered before ready", () => {
    const sink = vi.fn();
    connectWebview(sink);
    publishPalette([aColor(10)], 1);
    publishPalette([aColor(200)], 2);

    handleWebviewMessage(readyMessage());

    expect(sink).toHaveBeenCalledExactlyOnceWith(
      paletteMessage([aColor(200)], 2),
    );
  });

  it("delivers every palette published after ready", () => {
    const sink = vi.fn();
    connectWebview(sink);
    handleWebviewMessage(readyMessage());

    publishPalette([aColor(10)], 1);
    publishPalette([aColor(200)], 2);

    expect(sink).toHaveBeenCalledTimes(2);
    expect(sink).toHaveBeenLastCalledWith(paletteMessage([aColor(200)], 2));
  });

  it("still delivers when ready arrives before the WebView is connected", () => {
    // The WebView's own handshake call and the host's Comlink wiring complete
    // independently, so neither order is guaranteed.
    handleWebviewMessage(readyMessage());
    const sink = vi.fn();
    connectWebview(sink);

    publishPalette([aColor(10)], 1);

    expect(sink).toHaveBeenCalledExactlyOnceWith(
      paletteMessage([aColor(10)], 1),
    );
  });

  it("ignores a malformed message from the WebView", () => {
    const sink = vi.fn();
    connectWebview(sink);
    publishPalette([aColor(10)], 1);

    expect(() => handleWebviewMessage({ type: "nonsense" })).not.toThrow();
    expect(sink).not.toHaveBeenCalled();
  });

  it("ignores a well-formed message it has no use for", () => {
    // The WebView is free to send other variants as the plugin grows; only
    // the handshake means anything to the publisher.
    const sink = vi.fn();
    connectWebview(sink);
    publishPalette([aColor(10)], 1);

    handleWebviewMessage(paletteMessage([aColor(10)], 1));

    expect(sink).not.toHaveBeenCalled();
  });

  it("survives a WebView that has gone away mid-send", () => {
    const sink = vi.fn(() => {
      throw new Error("webview is gone");
    });
    connectWebview(sink);
    handleWebviewMessage(readyMessage());

    expect(() => publishPalette([aColor(10)], 1)).not.toThrow();
    expect(logger.error).toHaveBeenCalled();
  });

  it("survives a WebView that rejects the call instead of throwing", async () => {
    // Comlink answers with a promise, so a torn-down panel arrives as a
    // rejection. Caught synchronously it would escape as an unhandled one.
    const sink = vi.fn(() => Promise.reject(new Error("webview is gone")));
    connectWebview(sink);
    handleWebviewMessage(readyMessage());

    publishPalette([aColor(10)], 1);

    await vi.waitFor(() => expect(logger.error).toHaveBeenCalled());
  });

  it("stops sending after the panel disconnects", () => {
    const sink = vi.fn();
    connectWebview(sink);
    handleWebviewMessage(readyMessage());

    disconnectWebview();
    publishPalette([aColor(10)], 1);

    expect(sink).not.toHaveBeenCalled();
  });

  it("requires a fresh handshake after a reconnect", () => {
    const first = vi.fn();
    connectWebview(first);
    handleWebviewMessage(readyMessage());
    disconnectWebview();

    // A reopened panel loads a brand new WebView document, which has not yet
    // registered its own listener — the previous handshake says nothing about it.
    const second = vi.fn();
    connectWebview(second);
    publishPalette([aColor(10)], 1);

    expect(second).not.toHaveBeenCalled();
  });
});
