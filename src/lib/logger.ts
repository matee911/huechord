const PREFIX = "[ColorHarmony]";

export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, error?: Error, data?: Record<string, unknown>): void;
}

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

export const setLogger = (logger: Logger): void => {
  activeLogger = logger;
};

export const logger: Logger = {
  info(msg, data) {
    activeLogger.info(msg, data);
  },
  warn(msg, data) {
    activeLogger.warn(msg, data);
  },
  error(msg, error, data) {
    activeLogger.error(msg, error, data);
  },
};
