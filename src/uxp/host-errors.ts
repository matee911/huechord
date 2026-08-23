/**
 * Tells apart the two reasons Photoshop turns an acquisition down.
 *
 * A refusal because the host is busy is not a failure: the plugin asked at a
 * moment when a tool gesture, a dialog or a panel drag already held a modal
 * scope, and the next attempt goes through. Logging it as an error puts a
 * stack trace in front of whoever is reading the console for real problems.
 */

// Matched on the host's own wording, which is the only signal it gives -- there
// is no error code and no "is the host busy" query in the UXP surface. Kept
// deliberately loose: it has to survive Adobe rewording the sentence around
// the two words that carry the meaning.
const BUSY = /modal state/i;

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Whether the host turned the call down because it was already busy. */
export const isHostBusy = (error: unknown): boolean =>
  BUSY.test(messageOf(error));
