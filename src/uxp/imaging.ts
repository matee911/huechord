import { photoshop } from "../globals";
import { logger } from "../lib/logger";
import { isHostBusy } from "./host-errors";

export interface PixelAcquisitionResult {
  pixelCount: number;
  durationMs: number;
  /** Interleaved samples, one byte per component. */
  data: Uint8Array;
  /** Components per pixel — 3 for RGB, 4 for RGBA. */
  channels: number;
}

// Callers serialize their own calls -- see the in-flight state in
// startPixelPipeline. Nothing here prevents two of these from overlapping, and
// two modal scopes at once is not something the host promises to survive.
//
// Photoshop refuses imaging.getPixels() outside a modal scope ("The requested
// functionality is only allowed from inside a modal scope"), read-only or not.
// The scope wraps acquisition alone — measuring and disposing happen outside
// it, so the document stays blocked for as little time as possible.
export const acquirePixels = async (): Promise<
  PixelAcquisitionResult | undefined
> => {
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
          //
          // chunky is the host default, but it is stated for the same reason
          // colorSpace is: a planar buffer would feed extraction garbage
          // silently, with no error to point at.
          data: (await imageData.getData({ chunky: true })) as Uint8Array,
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
    // A busy host is not a failure. The pipeline reads on a timer of its own,
    // so it regularly asks while a tool gesture or a dialog already holds a
    // modal scope; the next attempt goes through. Reporting that as an error,
    // with a stack, buries the failures worth reading.
    if (isHostBusy(error))
      logger.info("Skipped pixel acquisition — the host was busy");
    // A document closed mid-acquisition, a read that failed, etc.: logged and
    // returned quietly rather than crashing the pipeline.
    else logger.error("Pixel acquisition failed", error as Error);
    return undefined;
  } finally {
    // Disposal sits outside the catch above, and the host may throw
    // synchronously despite the Promise return type -- hence try/catch rather
    // than .catch(). A leaked handle holds host memory for the session.
    try {
      await dispose?.();
    } catch (error) {
      logger.error("Failed to dispose pixel data", error as Error);
    }
  }
};
