import { describe, it, expect, vi, beforeEach } from "vitest";

const getPixelsMock = vi.fn();

vi.mock("../globals", () => ({
  photoshop: {
    imaging: {
      getPixels: (...args: unknown[]) => getPixelsMock(...args),
    },
  },
}));

const { acquirePixels } = await import("../uxp/imaging");

describe("acquirePixels", () => {
  beforeEach(() => {
    getPixelsMock.mockReset();
  });

  it("requests RGB 8-bit composite pixels downsampled to 100px wide", async () => {
    const dispose = vi.fn();
    getPixelsMock.mockResolvedValue({
      imageData: { width: 100, height: 60, dispose },
    });

    await acquirePixels();

    expect(getPixelsMock).toHaveBeenCalledWith({
      targetSize: { width: 100 },
      colorSpace: "RGB",
      componentSize: 8,
    });
  });

  it("disposes the image data and returns the pixel count and timing", async () => {
    const dispose = vi.fn();
    getPixelsMock.mockResolvedValue({
      imageData: { width: 100, height: 75, dispose },
    });

    const result = await acquirePixels();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      pixelCount: 7500,
      durationMs: expect.any(Number),
    });
  });

  it("does not throw and returns undefined when getPixels rejects", async () => {
    getPixelsMock.mockRejectedValue(new Error("no active document"));

    const result = await acquirePixels();

    expect(result).toBeUndefined();
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
