import { photoshop } from "../globals";
import { logger } from "../lib/logger";

export interface PixelAcquisitionResult {
  pixelCount: number;
  durationMs: number;
}

let acquisitionInFlight = false;

// imaging.getPixels() is read-only — it doesn't modify document, UI, or
// preference state — so per Adobe's executeAsModal docs it doesn't need
// modal scope, unlike batchPlay-based mutations elsewhere in this codebase.
export const acquirePixels = async (): Promise<
  PixelAcquisitionResult | undefined
> => {
  if (acquisitionInFlight) {
    logger.info("Skipping pixel acquisition — previous call still in flight");
    return undefined;
  }

  acquisitionInFlight = true;
  const start = Date.now();

  try {
    const { imageData } = await photoshop.imaging.getPixels({
      targetSize: { width: 100 },
      // Requested explicitly so pixel data is predictable regardless of the
      // source document's bit depth (8/16/32-bit) or color mode.
      colorSpace: "RGB",
      componentSize: 8,
    });

    try {
      const pixelCount = imageData.width * imageData.height;
      const durationMs = Date.now() - start;
      logger.info(`Got ${pixelCount} pixels in ${durationMs}ms`);
      return { pixelCount, durationMs };
    } finally {
      await imageData.dispose();
    }
  } catch (error) {
    // No open document, document closed mid-acquisition, etc. — log and
    // return quietly rather than crashing the pipeline.
    logger.error("Pixel acquisition failed", error as Error);
    return undefined;
  } finally {
    acquisitionInFlight = false;
  }
};
