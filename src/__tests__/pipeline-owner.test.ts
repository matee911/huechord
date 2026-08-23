import { describe, it, expect, vi } from "vitest";
import { createPipelineOwner } from "../uxp/pipeline-owner";

const anOwner = () => {
  const stop = vi.fn();
  const start = vi.fn(() => stop);
  return { owner: createPipelineOwner(start), start, stop };
};

describe("owning the pipeline across a panel's comings and goings", () => {
  it("starts nothing until the panel is on screen", () => {
    const { start } = anOwner();

    expect(start).not.toHaveBeenCalled();
  });

  it("starts the pipeline when the panel appears", () => {
    const { owner, start } = anOwner();

    owner.onVisible();

    expect(start).toHaveBeenCalledTimes(1);
  });

  // The WebView reports its state at the handshake and on every
  // visibilitychange, so the same state arrives more than once. A second start
  // would leave the first pipeline running with nobody holding its teardown --
  // two document listeners and two polls, one of them unreachable forever.
  it("does not start a second pipeline for a panel already on screen", () => {
    const { owner, start } = anOwner();

    owner.onVisible();
    owner.onVisible();

    expect(start).toHaveBeenCalledTimes(1);
  });

  it("stops the pipeline when the panel goes away", () => {
    const { owner, stop } = anOwner();
    owner.onVisible();

    owner.onHidden();

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("stops a pipeline once, however often the panel is reported gone", () => {
    const { owner, stop } = anOwner();
    owner.onVisible();

    owner.onHidden();
    owner.onHidden();

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("does nothing for a panel that was never on screen", () => {
    const { owner, stop } = anOwner();

    expect(() => owner.onHidden()).not.toThrow();
    expect(stop).not.toHaveBeenCalled();
  });

  it("starts a fresh pipeline when the panel comes back", () => {
    const { owner, start } = anOwner();

    owner.onVisible();
    owner.onHidden();
    owner.onVisible();

    expect(start).toHaveBeenCalledTimes(2);
  });
});
