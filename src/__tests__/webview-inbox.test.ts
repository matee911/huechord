import { describe, it, expect, vi, beforeEach } from "vitest";

const markWebviewReady = vi.fn();
const loggerWarn = vi.fn();
const loggerError = vi.fn();

vi.mock("../uxp/palette-publisher", () => ({
  markWebviewReady: () => markWebviewReady(),
}));
vi.mock("../lib/logger", () => ({
  logger: {
    warn: (...args: unknown[]) => loggerWarn(...args),
    error: (...args: unknown[]) => loggerError(...args),
  },
}));

const { handleWebviewMessage, listenForPanelVisibility } =
  await import("../uxp/webview-inbox");
const { readyMessage, visibilityMessage, analysisMessage } =
  await import("../bridge/messages");

describe("the WebView inbox", () => {
  beforeEach(() => {
    markWebviewReady.mockReset();
    loggerWarn.mockReset();
    loggerError.mockReset();
  });

  it("hands the handshake to the publisher", () => {
    handleWebviewMessage(readyMessage());

    expect(markWebviewReady).toHaveBeenCalledTimes(1);
  });

  it("reports the panel going off screen and coming back", () => {
    const seen: boolean[] = [];
    listenForPanelVisibility((visible) => seen.push(visible));

    handleWebviewMessage(visibilityMessage(false));
    handleWebviewMessage(visibilityMessage(true));

    expect(seen).toEqual([false, true]);
  });

  it("stops reporting to a listener that unsubscribed", () => {
    const listener = vi.fn();
    const unsubscribe = listenForPanelVisibility(listener);

    unsubscribe();
    handleWebviewMessage(visibilityMessage(false));

    expect(listener).not.toHaveBeenCalled();
  });

  // A teardown that runs after someone else has subscribed must not take the
  // new subscription down with it -- that would leave the panel with nothing
  // listening and no sign that anything was wrong.
  it("keeps a newer listener when an older teardown runs late", () => {
    const older = vi.fn();
    const newer = vi.fn();
    const unsubscribeOlder = listenForPanelVisibility(older);
    listenForPanelVisibility(newer);

    unsubscribeOlder();
    handleWebviewMessage(visibilityMessage(true));

    expect(newer).toHaveBeenCalledWith(true);
    expect(older).not.toHaveBeenCalled();
  });

  // The listener tears down the pipeline, which reaches into the host. A throw
  // there is reported by Comlink to the WebView as a failed call -- the wrong
  // side to hear about it, and the wrong side to do anything about it.
  it("keeps a throwing listener from escaping across the bridge", () => {
    listenForPanelVisibility(() => {
      throw new Error("teardown blew up");
    });

    expect(() => handleWebviewMessage(visibilityMessage(false))).not.toThrow();
    expect(loggerError).toHaveBeenCalledWith(
      "Failed to handle a visibility message from the WebView",
      expect.any(Error),
    );
  });

  // The same guarantee for the other branch: the publisher reaches into a
  // Comlink call of its own, and a throw there has the same wrong path home.
  it("keeps a throwing handshake from escaping across the bridge", () => {
    markWebviewReady.mockImplementation(() => {
      throw new Error("sink blew up");
    });

    expect(() => handleWebviewMessage(readyMessage())).not.toThrow();
    expect(loggerError).toHaveBeenCalledWith(
      "Failed to handle a ready message from the WebView",
      expect.any(Error),
    );
  });

  it("discards a malformed message without raising", () => {
    listenForPanelVisibility(vi.fn());

    expect(() => handleWebviewMessage({ type: "nonsense" })).not.toThrow();
    expect(markWebviewReady).not.toHaveBeenCalled();
    expect(loggerWarn).toHaveBeenCalledTimes(1);
  });

  // An analysis is well-formed, but it travels host -> WebView. One arriving
  // here is pointed the wrong way, not a reason to do anything.
  it("ignores a well-formed message aimed the other way", () => {
    const listener = vi.fn();
    listenForPanelVisibility(listener);

    handleWebviewMessage(analysisMessage([], null, [], 1));

    expect(markWebviewReady).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });
});
