import { describe, it, expect, vi, beforeEach } from "vitest";

const addNotificationListener = vi.fn();
const removeNotificationListener = vi.fn();

vi.mock("../globals", () => ({
  photoshop: {
    action: {
      addNotificationListener: (...args: unknown[]) =>
        addNotificationListener(...args),
      removeNotificationListener: (...args: unknown[]) =>
        removeNotificationListener(...args),
    },
  },
}));

const { listenForDocumentChanges } = await import("../uxp/events");

const DOCUMENT_CHANGE_EVENTS = [
  "set",
  "select",
  "make",
  "delete",
  "historyStepBackward",
  "historyStepForward",
];

describe("listenForDocumentChanges", () => {
  beforeEach(() => {
    addNotificationListener.mockReset().mockResolvedValue(undefined);
    removeNotificationListener.mockReset().mockResolvedValue(undefined);
  });

  it("subscribes to the documented set of document-change events", async () => {
    await listenForDocumentChanges(vi.fn());

    expect(addNotificationListener).toHaveBeenCalledWith(
      DOCUMENT_CHANGE_EVENTS,
      expect.any(Function),
    );
  });

  it("invokes the callback without processing the event descriptor", async () => {
    const onChange = vi.fn();
    await listenForDocumentChanges(onChange);
    const handler = addNotificationListener.mock.calls[0][1];

    handler("set", { some: "descriptor" });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith();
  });

  it("returns an unsubscribe function that removes the same listener", async () => {
    const unsubscribe = await listenForDocumentChanges(vi.fn());
    const handler = addNotificationListener.mock.calls[0][1];

    await unsubscribe();

    expect(removeNotificationListener).toHaveBeenCalledWith(
      DOCUMENT_CHANGE_EVENTS,
      handler,
    );
  });
});
