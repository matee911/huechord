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

const DOCUMENT_CHANGE_EVENTS = ["historyStateChanged"];

// Measured in Photoshop 27.9.1 by subscribing to {event: "all"}. Neither a
// brush stroke nor an adjustment emits `set`/`select`/`make`/`delete`/
// `historyStep*` — subscribing to those means the pipeline never runs.
const EVENTS_NOT_EMITTED_ON_EDIT = [
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

  // This asserts the subscription matches the manually verified constant; it
  // cannot prove Photoshop really emits it. Only a live host can — see the
  // measurement recorded in events.ts. Keep that verification in the loop when
  // this list changes.
  it("subscribes to the manually verified document-change event", async () => {
    await listenForDocumentChanges(vi.fn());

    expect(addNotificationListener).toHaveBeenCalledWith(
      DOCUMENT_CHANGE_EVENTS,
      expect.any(Function),
    );
  });

  it("does not subscribe to events Photoshop never emits on an edit", async () => {
    await listenForDocumentChanges(vi.fn());
    const [subscribed] = addNotificationListener.mock.calls[0] as [string[]];

    expect(subscribed).toEqual(
      expect.not.arrayContaining(EVENTS_NOT_EMITTED_ON_EDIT),
    );
  });

  it("invokes the callback without processing the event descriptor", async () => {
    const onChange = vi.fn();
    await listenForDocumentChanges(onChange);
    const handler = addNotificationListener.mock.calls[0][1];

    handler("historyStateChanged", { some: "descriptor" });

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
