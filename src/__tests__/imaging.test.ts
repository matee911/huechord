import { describe, it, expect, vi, beforeEach } from "vitest";

// Verbatim from Photoshop 27.9.1 when getPixels is called outside a modal
// scope. The mock reproduces the host's refusal so this suite fails if the
// modal wrapper is ever dropped again.
const MODAL_SCOPE_ERROR =
  "The requested functionality is only allowed from inside a modal scope.";

const getPixelsMock = vi.fn();
const executeAsModalMock = vi.fn();
const loggerMock = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

let modalDepth = 0;

vi.mock("../globals", () => ({
  photoshop: {
    core: {
      executeAsModal: (...args: unknown[]) => executeAsModalMock(...args),
    },
    imaging: {
      getPixels: (...args: unknown[]) => getPixelsMock(...args),
    },
  },
}));

vi.mock("../lib/logger", () => ({ logger: loggerMock }));

const { acquirePixels } = await import("../uxp/imaging");

type FakeImageData = {
  width: number;
  height: number;
  dispose: () => void;
};

const hostReturns = (imageData: FakeImageData) =>
  getPixelsMock.mockImplementation(async () => {
    if (modalDepth === 0) throw new Error(MODAL_SCOPE_ERROR);
    return { imageData };
  });

describe("acquirePixels", () => {
  beforeEach(() => {
    modalDepth = 0;
    getPixelsMock.mockReset();
    loggerMock.info.mockReset();
    loggerMock.warn.mockReset();
    loggerMock.error.mockReset();
    executeAsModalMock
      .mockReset()
      .mockImplementation(
        async (targetFunction: (context: unknown) => Promise<unknown>) => {
          modalDepth += 1;
          try {
            return await targetFunction({});
          } finally {
            modalDepth -= 1;
          }
        },
      );
  });

  it("requests RGB 8-bit composite pixels downsampled to 100px wide", async () => {
    hostReturns({ width: 100, height: 60, dispose: vi.fn() });

    await acquirePixels();

    expect(getPixelsMock).toHaveBeenCalledWith({
      targetSize: { width: 100 },
      colorSpace: "RGB",
      componentSize: 8,
    });
  });

  it("acquires pixels from inside a modal scope", async () => {
    hostReturns({ width: 100, height: 75, dispose: vi.fn() });

    const result = await acquirePixels();

    expect(executeAsModalMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ commandName: expect.any(String) }),
    );
    expect(result).toEqual({
      pixelCount: 7500,
      durationMs: expect.any(Number),
    });
  });

  it("keeps the modal scope to acquisition only", async () => {
    const dispose = vi.fn(() => {
      expect(modalDepth).toBe(0);
    });
    hostReturns({ width: 100, height: 75, dispose });

    await acquirePixels();

    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes the image data and returns the pixel count and timing", async () => {
    const dispose = vi.fn();
    hostReturns({ width: 100, height: 75, dispose });

    const result = await acquirePixels();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      pixelCount: 7500,
      durationMs: expect.any(Number),
    });
  });

  // The Definition of Done is about what the panel logs, so assert the message
  // itself — asserting only the return value lets a reworded or deleted log
  // slip through green.
  it("logs the pixel count and duration in the format the DoD requires", async () => {
    hostReturns({ width: 100, height: 75, dispose: vi.fn() });

    await acquirePixels();

    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.stringMatching(/^Got 7500 pixels in \d+ms$/),
    );
  });

  it("does not throw and returns undefined when getPixels rejects", async () => {
    const failure = new Error("no active document");
    getPixelsMock.mockRejectedValue(failure);

    const result = await acquirePixels();

    expect(result).toBeUndefined();
    expect(loggerMock.error).toHaveBeenCalledWith(
      "Pixel acquisition failed",
      failure,
    );
  });

  it("skips acquisition when a previous call is still in flight", async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    getPixelsMock.mockReturnValueOnce(pending);

    const first = acquirePixels();
    const second = await acquirePixels();

    expect(second).toBeUndefined();
    expect(getPixelsMock).toHaveBeenCalledTimes(1);

    resolveFirst({ imageData: { width: 10, height: 10, dispose: vi.fn() } });
    await first;
  });
});
