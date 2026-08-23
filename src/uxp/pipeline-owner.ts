/**
 * Owns whether the pipeline is running, given a panel that comes and goes.
 *
 * Split out of the React component that used to hold it: the decision is two
 * idempotence rules — a panel that is already being watched must not be watched
 * twice, and one that is already ignored must not be stopped twice — and both
 * were living in a `.tsx` file the test suite does not even load.
 */

export interface PipelineOwner {
  onVisible: () => void;
  onHidden: () => void;
}

export const createPipelineOwner = (start: () => () => void): PipelineOwner => {
  let stop: (() => void) | undefined;

  return {
    onVisible: () => {
      // The state repeats: it is sent once at the handshake and again on every
      // visibilitychange, and not every one of those is a transition. Starting
      // a second pipeline would leave the first one running with nothing left
      // holding its teardown.
      if (!stop) stop = start();
    },
    onHidden: () => {
      stop?.();
      stop = undefined;
    },
  };
};
