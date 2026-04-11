export type LogLevel = "debug" | "info" | "warn" | "error";

type LogPayload = Record<string, unknown> | undefined;

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function normalizeLogLevel(raw: string | undefined): LogLevel {
  const value = raw?.trim().toLowerCase();
  if (value === "debug" || value === "info" || value === "warn" || value === "error") {
    return value;
  }
  return "info";
}

function readConfiguredLogLevel() {
  return normalizeLogLevel(process.env.LOG_LEVEL);
}

function shouldWrite(level: LogLevel) {
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[readConfiguredLogLevel()];
}

export function logEvent(level: LogLevel, event: string, payload?: LogPayload) {
  if (!shouldWrite(level)) {
    return;
  }

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(payload ?? {}),
  };
  const serialized = JSON.stringify(entry);

  if (level === "error") {
    console.error(serialized);
    return;
  }
  if (level === "warn") {
    console.warn(serialized);
    return;
  }
  if (level === "debug") {
    console.debug(serialized);
    return;
  }
  console.info(serialized);
}
