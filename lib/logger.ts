// ── Structured logging ───────────────────────────────────────────────────────
// Emits single-line JSON so Vercel / any log drain can parse, filter and alert.
// Swap the sink for Sentry/Datadog/Logtail by editing `emit` only.

type Level = "debug" | "info" | "warn" | "error";

interface LogFields {
  [key: string]: unknown;
}

function emit(level: Level, message: string, fields?: LogFields) {
  const line = JSON.stringify({
    level,
    message,
    at: new Date().toISOString(),
    ...fields,
  });
  // eslint-disable-next-line no-console
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

export const log = {
  debug: (message: string, fields?: LogFields) => {
    if (process.env.NODE_ENV !== "production") emit("debug", message, fields);
  },
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, fields?: LogFields) => emit("error", message, fields),
};
