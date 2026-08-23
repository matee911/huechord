import { describe, it, expect, vi, beforeEach } from "vitest";

const loggerError = vi.fn();
let documents: unknown[] = [];

vi.mock("../globals", () => ({
  photoshop: {
    app: {
      get documents() {
        if (documents === null) throw new Error("host not ready");
        return documents;
      },
    },
  },
}));
vi.mock("../lib/logger", () => ({
  logger: { error: (...args: unknown[]) => loggerError(...args) },
}));

const { hasOpenDocument } = await import("../uxp/document-state");

describe("asking the host whether anything is open", () => {
  beforeEach(() => {
    loggerError.mockReset();
    documents = [];
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
});
