import { photoshop } from "../globals";

// Deliberately incomplete: some operations (Camera Raw Filter, dialogs from
// third-party plugins) fire only one event after their dialog closes, or
// none at all. This is a known gap in the PS notification API, not an
// oversight — Step 5 adds a polling fallback to compensate. Don't try to
// "complete" this list; extend the polling fallback instead.
const DOCUMENT_CHANGE_EVENTS = [
  "set",
  "select",
  "make",
  "delete",
  "historyStepBackward",
  "historyStepForward",
];

export const listenForDocumentChanges = async (
  onChange: () => void,
): Promise<() => Promise<void>> => {
  // The descriptor carries the full event payload, but re-analysis only
  // needs to know *that* something changed, not *what* — parsing it here
  // would be wasted work on every single PS event.
  const handler = () => onChange();

  await photoshop.action.addNotificationListener(
    DOCUMENT_CHANGE_EVENTS,
    handler,
  );

  return () =>
    photoshop.action.removeNotificationListener(
      DOCUMENT_CHANGE_EVENTS,
      handler,
    );
};
