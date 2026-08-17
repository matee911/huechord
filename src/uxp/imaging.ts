import { photoshop } from "../globals";
import { logger } from "../lib/logger";

// Derived from the API rather than imported, so it tracks @types/photoshop
// without depending on that package's internal module layout.
type PhotoshopImageData = Awaited<
  ReturnType<typeof photoshop.imaging.getPixels>
>["imageData"];

export interface PixelAcquisitionResult {
  pixelCount: number;
  durationMs: number;
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

  // Captured by assignment inside the scope rather than through the resolved
  // value, so the handle is reachable for disposal even if executeAsModal
  // rejects during teardown, after getPixels already allocated it.
  let acquired: PhotoshopImageData | undefined;

  try {
    await photoshop.core.executeAsModal(
      async () => {
        const { imageData } = await photoshop.imaging.getPixels({
          targetSize: { width: 100 },
          // Requested explicitly so pixel data is predictable regardless of the
          // source document's bit depth (8/16/32-bit) or color mode.
          colorSpace: "RGB",
          componentSize: 8,
        });

        acquired = imageData;
      },
      { commandName: "Acquire pixels for color harmony analysis" },
    );

    if (!acquired) return undefined;

    // Height follows the document's aspect ratio — targetSize constrains
    // width only, so this is not a fixed number.
    const pixelCount = acquired.width * acquired.height;
    const durationMs = Date.now() - start;
    logger.info(`Got ${pixelCount} pixels in ${durationMs}ms`);
    return { pixelCount, durationMs };
  } catch (error) {
    // No open document, document closed mid-acquisition, etc. — log and
    // return quietly rather than crashing the pipeline.
    logger.error("Pixel acquisition failed", error as Error);
    return undefined;
  } finally {
    await acquired?.dispose();
    acquisitionInFlight = false;
  }
};
