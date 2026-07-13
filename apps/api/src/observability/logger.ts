import { randomBytes } from "node:crypto";

/**
 * Zero-dependency structured logger. Emits one JSON object per line to stdout
 * (stderr for errors), which is trivially ingestible by log shippers. Kept
 * dependency-free in line with the project's minimal-runtime philosophy; can be
 * swapped for pino later behind this same interface without touching callers.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function activeLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL || "info").toLowerCase();
  return raw in LEVEL_RANK ? (raw as LogLevel) : "info";
}

function emit(level: LogLevel, message: string, fields?: LogFields): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[activeLevel()]) {
    return;
  }
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    msg: message,
    ...fields
  });
  if (level === "error") {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** Returns a logger that merges `base` fields into every entry. */
  child(base: LogFields): Logger;
}

function makeLogger(base: LogFields): Logger {
  const withBase = (fields?: LogFields): LogFields => ({ ...base, ...fields });
  return {
    debug: (message, fields) => emit("debug", message, withBase(fields)),
    info: (message, fields) => emit("info", message, withBase(fields)),
    warn: (message, fields) => emit("warn", message, withBase(fields)),
    error: (message, fields) => emit("error", message, withBase(fields)),
    child: (childBase) => makeLogger({ ...base, ...childBase })
  };
}

export const logger: Logger = makeLogger({});

export function newRequestId(): string {
  return `req-${randomBytes(8).toString("hex")}`;
}
