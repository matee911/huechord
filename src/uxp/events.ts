import { photoshop } from "../globals";

// Measured against a live Photoshop with an {event: "all"} listener: a brush
// stroke emits hostFocusChanged / toolModalStateChanged / historyStateChanged,
// an adjustment emits invokeCommand / modalStateChanged / historyStateChanged /
// <adjustment name>. historyStateChanged is the only event common to both, and
// it covers undo/redo too.
//
// Deliberately incomplete: switching documents, and operations that never reach
// the history stack, emit nothing here. That is a known gap in the PS
// notification API — Step 5 adds a polling fallback. Extend that fallback
// rather than padding this list with events that don't actually fire.
const DOCUMENT_CHANGE_EVENTS = ["historyStateChanged"];

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
