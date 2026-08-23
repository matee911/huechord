import { describe, it, expect, vi } from "vitest";
import {
  reportPanelVisibility,
  type VisibilityPage,
} from "../panel-visibility";
import { visibilityMessage } from "../../../src/bridge/messages";

const aPage = (visibilityState: string) => {
  const listeners: (() => void)[] = [];
  const page: VisibilityPage = {
    visibilityState,
    addEventListener: (_type, listener) => listeners.push(listener),
    removeEventListener: (_type, listener) => {
      const at = listeners.indexOf(listener);
      if (at >= 0) listeners.splice(at, 1);
    },
  };
  return {
    page,
    becomes: (next: string) => {
      page.visibilityState = next;
      for (const listener of [...listeners]) listener();
    },
    listenerCount: () => listeners.length,
  };
};

describe("reporting the panel's visibility", () => {
  it("says so straight away, before anything has changed", () => {
    const send = vi.fn();
    const { page } = aPage("visible");

    reportPanelVisibility(send, page);

    expect(send).toHaveBeenCalledExactlyOnceWith(visibilityMessage(true));
  });

  it("reports the panel being closed and opened again", () => {
    const send = vi.fn();
    const { page, becomes } = aPage("visible");
    reportPanelVisibility(send, page);
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
    const { page } = aPage("prerender");

    reportPanelVisibility(send, page);

    expect(send).toHaveBeenCalledExactlyOnceWith(visibilityMessage(true));
  });

  it("stops listening when torn down", () => {
    const send = vi.fn();
    const { page, becomes, listenerCount } = aPage("visible");

    reportPanelVisibility(send, page)();
    send.mockClear();
    becomes("hidden");

    expect(listenerCount()).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
});
