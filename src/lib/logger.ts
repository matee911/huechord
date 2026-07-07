const PREFIX = "[ColorHarmony]";

export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, error?: Error, data?: Record<string, unknown>): void;
}

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}

// Error objects don't survive structured-clone across the UXP<->WebView
// postMessage bridge, so callers forwarding errors across it must serialize
// them through this first.
export const serializeError = (error: Error): SerializedError => ({
  name: error.name,
  message: error.message,
  stack: error.stack,
});

const consoleLogger: Logger = {
  info(msg, data) {
    if (data) {
      console.log(`${PREFIX} ${msg}`, data);
    } else {
      console.log(`${PREFIX} ${msg}`);
    }
  },
  warn(msg, data) {
    if (data) {
      console.warn(`${PREFIX} ${msg}`, data);
    } else {
      console.warn(`${PREFIX} ${msg}`);
    }
  },
  error(msg, error, data) {
    if (error && data) {
      console.error(`${PREFIX} ${msg}`, error, data);
    } else if (error) {
      console.error(`${PREFIX} ${msg}`, error);
    } else {
      console.error(`${PREFIX} ${msg}`);
    }
  },
};

let activeLogger: Logger = consoleLogger;
let ambientContext: Record<string, unknown> = {};

export const setLogger = (logger: Logger): void => {
  activeLogger = logger;
};

// Context set here (e.g. document id, plugin version, current pipeline
// step) is merged into every subsequent info/warn/error call, so call
// sites don't need to repeat it — this is what future backends (Sentry)
// rely on for tags/context instead of every call site passing it by hand.
export const setLoggerContext = (context: Record<string, unknown>): void => {
  ambientContext = context;
};

export const clearLoggerContext = (): void => {
  ambientContext = {};
};

const mergeContext = (
  data?: Record<string, unknown>,
): Record<string, unknown> | undefined => {
  if (Object.keys(ambientContext).length === 0) return data;
  return { ...ambientContext, ...data };
};

export const logger: Logger = {
  info(msg, data) {
    activeLogger.info(msg, mergeContext(data));
  },
  warn(msg, data) {
    activeLogger.warn(msg, mergeContext(data));
  },
  error(msg, error, data) {
    activeLogger.error(msg, error, mergeContext(data));
  },
};
