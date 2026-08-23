import { photoshop } from "../globals";
import { logger } from "../lib/logger";

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
    logger.error("Failed to ask the host for open documents", error as Error);
    return true;
  }
};
