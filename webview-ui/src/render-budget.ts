import { logger } from "../../src/lib/logger";

// The panel has to redraw well inside a frame for the wheel to keep up with
// an ongoing edit, and this is the number the whole pipeline budget is built
// on. Measuring it beats asserting it: ≤8 dots is cheap in theory, and this
// says whether it is cheap on the retoucher's machine.
export const RENDER_BUDGET_MS = 16;

export const isWithinRenderBudget = (elapsedMs: number): boolean =>
  elapsedMs <= RENDER_BUDGET_MS;

/** Reports how long the panel took to show a palette it had just received. */
export const reportRenderTime = (elapsedMs: number, dots: number): void => {
  const rounded = Math.round(elapsedMs * 10) / 10;
  const message = `Rendered ${dots} colors in ${rounded}ms`;
  if (isWithinRenderBudget(elapsedMs)) logger.info(message);
  else logger.warn(`${message}, over the ${RENDER_BUDGET_MS}ms budget`);
};
