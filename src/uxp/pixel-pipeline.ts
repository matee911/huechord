import { logger } from "../lib/logger";
import { debounce } from "../lib/debounce";
import { acquirePixels } from "./imaging";
import { listenForDocumentChanges } from "./events";

export const DEBOUNCE_MS = 400;

/**
 * Wires document changes to debounced pixel acquisition and hands back the
 * teardown. It lives outside the React component so the wiring — and above all
 * its teardown paths — can be tested in the Node environment the rest of the
 * suite runs in, instead of pulling in a DOM to mount a panel.
 */
export const startPixelPipeline = (): (() => void) => {
  const debouncedAcquire = debounce(() => {
    void acquirePixels();
  }, DEBOUNCE_MS);

  // Teardown can run before the subscription resolves (unmount, StrictMode's
  // double-invoke, a quick panel close/reopen). Without the flag the listener
  // registers a moment later and is never removed, so it keeps driving
  // acquisition for the rest of the session and stacks up on every restart.
  let stopped = false;
  let unsubscribe: (() => Promise<void>) | undefined;

  const unsubscribeSafely = (unsub: () => Promise<void>) => {
    unsub().catch((error) => {
      logger.error(
        "Failed to unsubscribe from document changes",
        error as Error,
      );
    });
  };

  listenForDocumentChanges(debouncedAcquire)
    .then((unsub) => {
      if (stopped) unsubscribeSafely(unsub);
      else unsubscribe = unsub;
    })
    .catch((error) => {
      logger.error("Failed to subscribe to document changes", error as Error);
    });

  return () => {
    stopped = true;
    debouncedAcquire.cancel();
    if (unsubscribe) unsubscribeSafely(unsubscribe);
  };
};
