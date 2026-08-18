import { logger } from "../../src/lib/logger";

// The panel has to redraw well inside a frame for the wheel to keep up with
// an ongoing edit, and this is the number the whole pipeline budget is built
// on. Measuring it beats asserting it: ≤8 dots is cheap in theory, and this
// says whether it is cheap on the retoucher's machine.
export const RENDER_BUDGET_MS = 16;

/**
 * Reports how long the panel took to turn a palette it had just received into
 * a committed render. Measured to the commit, not to the paint -- that is the
 * part this code owns, and the part that regresses when the panel gains work.
 */
export const reportRenderTime = (elapsedMs: number, dots: number): void => {
  const rounded = Math.round(elapsedMs * 10) / 10;
  const message = `Rendered ${dots} colors in ${rounded}ms`;
  if (elapsedMs <= RENDER_BUDGET_MS) logger.info(message);
  else logger.warn(`${message}, over the ${RENDER_BUDGET_MS}ms budget`);
};
