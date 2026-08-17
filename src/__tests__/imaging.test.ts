import { describe, it, expect, vi, beforeEach } from "vitest";

// Verbatim from the host when getPixels is called outside a modal scope. The
// mock reproduces that refusal so this suite fails if the wrapper is ever
// dropped again.
const MODAL_SCOPE_ERROR =
  "The requested functionality is only allowed from inside a modal scope.";

const getPixelsMock = vi.fn();
const executeAsModalMock = vi.fn();
const loggerMock = { info: vi.fn(), error: vi.fn() };

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
  components?: number;
  getData?: () => Promise<Uint8Array>;
};

// Every case here cares about the wrapper's control flow, not the samples, so
// the buffer defaults to something valid rather than being spelled out.
const withDefaults = (imageData: FakeImageData): FakeImageData => ({
  components: 4,
  getData: async () => new Uint8Array(imageData.width * imageData.height * 4),
  ...imageData,
});

const hostReturns = (fake: FakeImageData) => {
  const imageData = withDefaults(fake);

  return getPixelsMock.mockImplementation(async () => {
    if (modalDepth === 0) throw new Error(MODAL_SCOPE_ERROR);
    return { imageData };
  });
};

describe("acquirePixels", () => {
  beforeEach(() => {
    modalDepth = 0;
    getPixelsMock.mockReset();
    loggerMock.info.mockReset();
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
      data: expect.any(Uint8Array),
      channels: 4,
    });
  });

  // The samples are what the caller actually came for; returning only the count
  // is how this wrapper behaved before extraction existed.
  it("reads the samples inside the modal scope and hands them back", async () => {
    const samples = Uint8Array.from([10, 20, 30, 255, 40, 50, 60, 255]);
    let modalDepthAtRead = -1;
    hostReturns({
      width: 2,
      height: 1,
      components: 4,
      getData: async () => {
        modalDepthAtRead = modalDepth;
        return samples;
      },
      dispose: vi.fn(),
    });

    const result = await acquirePixels();

    expect(modalDepthAtRead).toBe(1);
    expect(result?.data).toBe(samples);
    expect(result?.channels).toBe(4);
  });

  // getData is the new failure surface this wrapper exposes. dispose is bound
  // before the read, so the handle must still be released when the read is the
  // thing that fails -- otherwise a transient host error leaks pixel data.
  it("still disposes when reading the samples fails", async () => {
    const dispose = vi.fn();
    const failure = new Error("image data released");
    hostReturns({
      width: 100,
      height: 75,
      getData: () => Promise.reject(failure),
      dispose,
    });

    const result = await acquirePixels();

    expect(result).toBeUndefined();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(loggerMock.error).toHaveBeenCalledWith(
      "Pixel acquisition failed",
      failure,
    );

    // The in-flight guard has to clear too, or one transient read failure
    // silences the panel for the rest of the session.
    await acquirePixels();
    expect(getPixelsMock).toHaveBeenCalledTimes(2);
  });

  it("disposes the image data once, after the modal scope has closed", async () => {
    let modalDepthAtDispose = -1;
    const dispose = vi.fn(() => {
      modalDepthAtDispose = modalDepth;
    });
    hostReturns({ width: 100, height: 75, dispose });

    await acquirePixels();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(modalDepthAtDispose).toBe(0);
  });

  it("still disposes when the code after acquisition throws", async () => {
    const dispose = vi.fn();
    hostReturns({ width: 100, height: 75, dispose });
    loggerMock.info.mockImplementation(() => {
      throw new Error("logger blew up");
    });

    const result = await acquirePixels();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(result).toBeUndefined();
  });

  // A failing dispose must not wedge the in-flight guard: if it did, every
  // later acquisition would be skipped and the panel would go silent for the
  // rest of the session.
  it("keeps working after a dispose failure", async () => {
    hostReturns({
      width: 100,
      height: 75,
      dispose: vi.fn(() => {
        throw new Error("handle already released");
      }),
    });

    const first = await acquirePixels();
    const second = await acquirePixels();

    const acquired = {
      pixelCount: 7500,
      durationMs: expect.any(Number),
      data: expect.any(Uint8Array),
      channels: 4,
    };
    expect(first).toEqual(acquired);
    expect(second).toEqual(acquired);
    expect(loggerMock.error).toHaveBeenCalledWith(
      "Failed to dispose pixel data",
      expect.any(Error),
    );
  });

  // Asserts the message itself, not just the returned object — a reworded or
  // deleted log would otherwise slip through green while the panel went silent.
  it("logs the pixel count and duration", async () => {
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

    resolveFirst({
      imageData: withDefaults({ width: 10, height: 10, dispose: vi.fn() }),
    });
    await first;
  });
});
