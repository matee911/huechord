import { visibilityMessage } from "../../src/bridge/messages";

/**
 * Tells the host whether the panel is on screen.
 *
 * Photoshop announces a panel appearing and says nothing when it is closed, and
 * the plugin's React tree is never unmounted -- so nothing in the UXP context
 * can tell that the panel is gone. The page inside it can: closing the panel
 * flips `visibilityState` to "hidden".
 */

export const reportPanelVisibility = (
  send: (message: unknown) => void,
): (() => void) => {
  // Sent once up front, not only on change: the host has no way to ask, and
  // the first change may be the panel closing an hour from now.
  const report = () =>
    send(visibilityMessage(document.visibilityState !== "hidden"));

  report();
  document.addEventListener("visibilitychange", report);

  return () => document.removeEventListener("visibilitychange", report);
};
