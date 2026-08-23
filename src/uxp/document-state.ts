import { photoshop } from "../globals";
import { logger } from "../lib/logger";
import { isHostBusy } from "./host-errors";

/**
 * Whether Photoshop has anything open to analyze.
 *
 * Asked before acquisition rather than discovered by failing one: with no
 * document the read enters a modal scope only to be turned down, and the panel
 * cannot tell that state from a document whose colors are all transparent.
 */
export const hasOpenDocument = (): boolean => {
  try {
    return photoshop.app.documents.length > 0;
  } catch (error) {
    // A host that cannot answer is not a host with no document. Treating it as
    // "there is one" keeps the pipeline on its usual path, where a real failure
    // is already reported.
    //
    // Quiet when the host is merely busy, for the same reason acquisition is:
    // this runs on the same five-second timer, so reporting it as a failure
    // would put the stack traces straight back into the console.
    if (isHostBusy(error))
      logger.info(
        `Could not ask the host for open documents: ${(error as Error).message}`,
      );
    else
      logger.error("Failed to ask the host for open documents", error as Error);
    return true;
  }
};
