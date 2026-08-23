import { describe, it, expect, vi, afterEach } from "vitest";
import { reportPanelVisibility } from "../panel-visibility";
import { visibilityMessage } from "../../../src/bridge/messages";

// The suite runs in Node, where there is no document. Stubbed rather than
// injected: the page a WebView reports on is always its own, and a parameter
// for it would be production surface that exists only for these tests.
const aPage = (visibilityState: string) => {
  const listeners: (() => void)[] = [];
  const page = {
    visibilityState,
    addEventListener: (_type: string, listener: () => void) =>
      listeners.push(listener),
    removeEventListener: (_type: string, listener: () => void) => {
      const at = listeners.indexOf(listener);
      if (at >= 0) listeners.splice(at, 1);
    },
  };
  vi.stubGlobal("document", page);
  return {
    page,
    becomes: (next: string) => {
      page.visibilityState = next;
      for (const listener of [...listeners]) listener();
    },
    listenerCount: () => listeners.length,
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reporting the panel's visibility", () => {
  it("says so straight away, before anything has changed", () => {
    const send = vi.fn();
    aPage("visible");

    reportPanelVisibility(send);

    expect(send).toHaveBeenCalledExactlyOnceWith(visibilityMessage(true));
  });

  it("reports the panel being closed and opened again", () => {
    const send = vi.fn();
    const { becomes } = aPage("visible");
    reportPanelVisibility(send);
    send.mockClear();

    becomes("hidden");
    becomes("visible");

    expect(send.mock.calls.flat()).toEqual([
      visibilityMessage(false),
      visibilityMessage(true),
    ]);
  });

  // "prerender" is neither of the two states this cares about, and treating an
  // unknown state as hidden would stop the pipeline for a panel on screen.
  it("counts any state that is not hidden as on screen", () => {
    const send = vi.fn();
    aPage("prerender");

    reportPanelVisibility(send);

    expect(send).toHaveBeenCalledExactlyOnceWith(visibilityMessage(true));
  });

  it("stops listening when torn down", () => {
    const send = vi.fn();
    const { becomes, listenerCount } = aPage("visible");

    reportPanelVisibility(send)();
    send.mockClear();
    becomes("hidden");

    expect(listenerCount()).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
});
