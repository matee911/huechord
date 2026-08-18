import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  RENDER_BUDGET_MS,
  isWithinRenderBudget,
  reportRenderTime,
} from "../render-budget";
import { setLogger, type Logger } from "../../../src/lib/logger";

let logger: Logger;

const loggedBy = (method: Logger["info"]): string =>
  (method as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;

beforeEach(() => {
  logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  setLogger(logger);
});

describe("render budget", () => {
  it("counts a render at the budget as within it", () => {
    expect(isWithinRenderBudget(RENDER_BUDGET_MS)).toBe(true);
  });

  it("counts a render past the budget as over it", () => {
    expect(isWithinRenderBudget(RENDER_BUDGET_MS + 0.1)).toBe(false);
  });

  it("reports a render inside the budget without raising the alarm", () => {
    reportRenderTime(4.26, 5);

    expect(loggedBy(logger.info)).toBe("Rendered 5 colors in 4.3ms");
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("names the budget it blew when a render is too slow", () => {
    // A warning that only says "slow" leaves whoever reads the console
    // guessing what it was measured against.
    reportRenderTime(40, 8);

    expect(loggedBy(logger.warn)).toBe(
      `Rendered 8 colors in 40ms, over the ${RENDER_BUDGET_MS}ms budget`,
    );
  });
});
