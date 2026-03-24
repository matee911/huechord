import { describe, it, expect, vi } from "vitest";
import { logger, setLogger, type Logger } from "../lib/logger";

describe("logger", () => {
  it("info does not throw", () => {
    expect(() => logger.info("test message")).not.toThrow();
  });

  it("warn does not throw", () => {
    expect(() => logger.warn("test warning")).not.toThrow();
  });

  it("error does not throw", () => {
    expect(() => logger.error("test error")).not.toThrow();
  });

  it("error with Error object does not throw", () => {
    expect(() =>
      logger.error("test error", new Error("boom")),
    ).not.toThrow();
  });

  it("info with data does not throw", () => {
    expect(() => logger.info("test", { key: "value" })).not.toThrow();
  });

  it("can swap logger implementation via setLogger", () => {
    const mockLogger: Logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    setLogger(mockLogger);
    logger.info("hello", { foo: "bar" });

    expect(mockLogger.info).toHaveBeenCalledWith("hello", { foo: "bar" });
  });
});
