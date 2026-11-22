type LogLevel = "debug" | "info" | "warn" | "error";

type LogMeta = Record<string, unknown>;

function serializeError(error: unknown) {
  if (error instanceof Error) {
    const e = error as unknown as Record<string, unknown>;
    return {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
      ...(typeof e.code === "string" ? { code: e.code } : {}),
      ...(typeof e.status === "number" ? { status: e.status } : {}),
    };
  }
  return { message: String(error) };
}

function write(level: LogLevel, message: string, meta?: LogMeta) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug(message: string, meta?: LogMeta) {
    if (process.env.NODE_ENV === "production") return;
    write("debug", message, meta);
  },
  info(message: string, meta?: LogMeta) {
    write("info", message, meta);
  },
  warn(message: string, meta?: LogMeta) {
    write("warn", message, meta);
  },
  error(message: string, error?: unknown, meta?: LogMeta) {
    write("error", message, {
      ...(meta ?? {}),
      ...(error !== undefined ? { error: serializeError(error) } : {}),
    });
  },
};
