import { photoshop } from "../globals";
import { logger } from "../lib/logger";

export interface PixelAcquisitionResult {
  pixelCount: number;
  durationMs: number;
  /** Interleaved samples, one byte per component. */
  data: Uint8Array;
  /** Components per pixel — 3 for RGB, 4 for RGBA. */
  channels: number;
}

let acquisitionInFlight = false;

// Photoshop refuses imaging.getPixels() outside a modal scope ("The requested
// functionality is only allowed from inside a modal scope"), read-only or not.
// The scope wraps acquisition alone — measuring and disposing happen outside
// it, so the document stays blocked for as little time as possible.
export const acquirePixels = async (): Promise<
  PixelAcquisitionResult | undefined
> => {
  if (acquisitionInFlight) {
    logger.info("Skipping pixel acquisition — previous call still in flight");
    return undefined;
  }

  acquisitionInFlight = true;
  const start = Date.now();

  // Bound the instant the handle exists, so disposal still happens if
  // executeAsModal rejects during teardown after getPixels allocated it.
  let dispose: (() => Promise<void>) | undefined;

  try {
    const acquired = await photoshop.core.executeAsModal(
      async () => {
        const { imageData } = await photoshop.imaging.getPixels({
          targetSize: { width: 100 },
          // Requested explicitly so pixel data is predictable regardless of the
          // source document's bit depth (8/16/32-bit) or color mode.
          colorSpace: "RGB",
          componentSize: 8,
        });

        dispose = () => imageData.dispose();

        return {
          width: imageData.width,
          height: imageData.height,
          channels: imageData.components,
          // Reading the samples is part of acquisition, so it belongs inside
          // the scope: the handle is only guaranteed valid until disposal, and
          // disposal is what closes this out.
          //
          // The union in the declared return type covers 16- and 32-bit
          // sources; componentSize: 8 above is what narrows it to bytes here.
          data: (await imageData.getData({})) as Uint8Array,
        };
      },
      { commandName: "Acquire pixels for color harmony analysis" },
    );

    // Height follows the document's aspect ratio — targetSize constrains
    // width only, so this is not a fixed number.
    const pixelCount = acquired.width * acquired.height;
    const durationMs = Date.now() - start;
    logger.info(`Got ${pixelCount} pixels in ${durationMs}ms`);
    return {
      pixelCount,
      durationMs,
      data: acquired.data,
      channels: acquired.channels,
    };
  } catch (error) {
    // No open document, document closed mid-acquisition, etc. — log and
    // return quietly rather than crashing the pipeline.
    logger.error("Pixel acquisition failed", error as Error);
    return undefined;
  } finally {
    // Reset first: disposal sits outside the catch above, so a throwing dispose
    // would otherwise skip it and leave the guard stuck on, silencing the panel
    // for the rest of the session. try/catch rather than .catch() because the
    // host may throw synchronously despite the Promise return type.
    acquisitionInFlight = false;

    try {
      await dispose?.();
    } catch (error) {
      logger.error("Failed to dispose pixel data", error as Error);
    }
  }
};
