import { describe, it, expect, vi, afterEach } from "vitest";
import {
  logger,
  setLogger,
  setLoggerContext,
  clearLoggerContext,
  serializeError,
  type Logger,
} from "../lib/logger";

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
    expect(() => logger.error("test error", new Error("boom"))).not.toThrow();
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

  describe("ambient context", () => {
    afterEach(() => {
      clearLoggerContext();
    });

    it("merges ambient context into every call", () => {
      const mockLogger: Logger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      setLogger(mockLogger);
      setLoggerContext({ documentId: "doc-1" });

      logger.info("hello");

      expect(mockLogger.info).toHaveBeenCalledWith("hello", {
        documentId: "doc-1",
      });
    });

    it("merges ambient context into error calls alongside the Error object", () => {
      const mockLogger: Logger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      setLogger(mockLogger);
      setLoggerContext({ documentId: "doc-1" });
      const err = new Error("boom");

      logger.error("failed", err);

      expect(mockLogger.error).toHaveBeenCalledWith("failed", err, {
        documentId: "doc-1",
      });
    });

    it("lets per-call data override ambient context on key conflict", () => {
      const mockLogger: Logger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      setLogger(mockLogger);
      setLoggerContext({ step: "acquisition" });

      logger.info("hello", { step: "extraction" });

      expect(mockLogger.info).toHaveBeenCalledWith("hello", {
        step: "extraction",
      });
    });

    it("resets ambient context via clearLoggerContext", () => {
      const mockLogger: Logger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      setLogger(mockLogger);
      setLoggerContext({ documentId: "doc-1" });
      clearLoggerContext();

      logger.info("hello");

      expect(mockLogger.info).toHaveBeenCalledWith("hello", undefined);
    });
  });
});

describe("serializeError", () => {
  it("extracts name, message, and stack from an Error", () => {
    const error = new Error("boom");

    const serialized = serializeError(error);

    expect(serialized).toEqual({
      name: "Error",
      message: "boom",
      stack: error.stack,
    });
  });
});
