import { describe, it, expect, vi, beforeEach } from "vitest";

const loggerError = vi.fn();
const loggerInfo = vi.fn();
let documents: unknown[] = [];
let hostMessage = "host not ready";

vi.mock("../globals", () => ({
  photoshop: {
    app: {
      get documents() {
        if (documents === null) throw new Error(hostMessage);
        return documents;
      },
    },
  },
}));
vi.mock("../lib/logger", () => ({
  logger: {
    error: (...args: unknown[]) => loggerError(...args),
    info: (...args: unknown[]) => loggerInfo(...args),
  },
}));

const { hasOpenDocument } = await import("../uxp/document-state");

describe("asking the host whether anything is open", () => {
  beforeEach(() => {
    loggerError.mockReset();
    loggerInfo.mockReset();
    documents = [];
    hostMessage = "host not ready";
  });

  it("says no when nothing is open", () => {
    expect(hasOpenDocument()).toBe(false);
  });

  it("says yes when a document is open", () => {
    documents = [{}];

    expect(hasOpenDocument()).toBe(true);
  });

  // A host that cannot answer is not a host with no document. Answering "no"
  // would park the panel on "open a document" while one is open in front of
  // the user, and nothing would take it off again.
  it("assumes a document rather than silencing the panel when the host throws", () => {
    documents = null as unknown as unknown[];

    expect(hasOpenDocument()).toBe(true);
    expect(loggerError).toHaveBeenCalledWith(
      "Failed to ask the host for open documents",
      expect.any(Error),
    );
  });

  // This runs on the same five-second timer as acquisition, so reporting a
  // busy host as a failure here would put the stack traces straight back into
  // the console that the quiet path was added to clear.
  it("stays quiet when the host is merely busy", () => {
    documents = null as unknown as unknown[];
    hostMessage = "host is in a modal state";

    expect(hasOpenDocument()).toBe(true);
    expect(loggerError).not.toHaveBeenCalled();
    expect(loggerInfo).toHaveBeenCalledWith(
      expect.stringContaining("modal state"),
    );
  });
});
