import net from "node:net";
import tls from "node:tls";

type RedisValue = string | number | null | RedisValue[];
type ParsedResp = {
  value: RedisValue | Error;
  nextOffset: number;
};

type RedisRateLimitResult = {
  count: number;
  ttlMs: number;
};

const REDIS_UNAVAILABLE_COOLDOWN_MS = 30_000;
const REDIS_TIMEOUT_MS = 2_000;
const RATE_LIMIT_KEY_PREFIX = "merch-table:rate-limit";

const RATE_LIMIT_SCRIPT = [
  "local current = redis.call('INCR', KEYS[1])",
  "if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end",
  "local ttl = redis.call('PTTL', KEYS[1])",
  "if ttl < 0 then ttl = tonumber(ARGV[1]) end",
  "return {current, ttl}",
].join(" ");

type RedisConnectionOptions = {
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  password: string | null;
  db: number;
};

type RedisRateLimitState = {
  disabledUntil: number;
  lastWarningAt: number;
};

const REDIS_STATE_KEY = "__merch_table_redis_rate_limit_state__";

function getRedisState() {
  const globalScope = globalThis as typeof globalThis & {
    [REDIS_STATE_KEY]?: RedisRateLimitState;
  };

  if (!globalScope[REDIS_STATE_KEY]) {
    globalScope[REDIS_STATE_KEY] = {
      disabledUntil: 0,
      lastWarningAt: 0,
    };
  }

  return globalScope[REDIS_STATE_KEY];
}

function parseInteger(raw: string | null | undefined, fallback: number) {
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function parseRedisConnectionOptions() {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    return null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(redisUrl);
  } catch {
    return null;
  }

  if (!["redis:", "rediss:"].includes(parsedUrl.protocol)) {
    return null;
  }

  const host = parsedUrl.hostname;
  if (!host) {
    return null;
  }

  const secure = parsedUrl.protocol === "rediss:";
  const port = parseInteger(parsedUrl.port, secure ? 6380 : 6379);
  const username = parsedUrl.username
    ? decodeURIComponent(parsedUrl.username)
    : null;
  const password = parsedUrl.password
    ? decodeURIComponent(parsedUrl.password)
    : null;
  const db = parseInteger(parsedUrl.pathname.replace(/^\//, ""), 0);

  return {
    host,
    port,
    secure,
    username,
    password,
    db,
  } satisfies RedisConnectionOptions;
}

function encodeRedisCommand(args: string[]) {
  const segments: Buffer[] = [Buffer.from(`*${args.length}\r\n`, "utf8")];

  for (const arg of args) {
    const encodedArg = Buffer.from(arg, "utf8");
    segments.push(Buffer.from(`$${encodedArg.length}\r\n`, "utf8"));
    segments.push(encodedArg);
    segments.push(Buffer.from("\r\n", "utf8"));
  }

  return Buffer.concat(segments);
}

function readLine(buffer: Buffer, offset: number) {
  const lineEnd = buffer.indexOf("\r\n", offset);
  if (lineEnd < 0) {
    return null;
  }

  return {
    value: buffer.toString("utf8", offset, lineEnd),
    nextOffset: lineEnd + 2,
  };
}

function parseResp(buffer: Buffer, offset = 0): ParsedResp | null {
  if (offset >= buffer.length) {
    return null;
  }

  const prefix = String.fromCharCode(buffer[offset]);
  const line = readLine(buffer, offset + 1);
  if (!line) {
    return null;
  }

  if (prefix === "+") {
    return {
      value: line.value,
      nextOffset: line.nextOffset,
    };
  }

  if (prefix === "-") {
    return {
      value: new Error(line.value),
      nextOffset: line.nextOffset,
    };
  }

  if (prefix === ":") {
    const parsedInteger = Number(line.value);
    if (!Number.isFinite(parsedInteger)) {
      throw new Error("Invalid Redis integer response.");
    }

    return {
      value: parsedInteger,
      nextOffset: line.nextOffset,
    };
  }

  if (prefix === "$") {
    const length = Number(line.value);
    if (!Number.isInteger(length)) {
      throw new Error("Invalid Redis bulk response length.");
    }

    if (length < 0) {
      return {
        value: null,
        nextOffset: line.nextOffset,
      };
    }

    const endOffset = line.nextOffset + length;
    if (buffer.length < endOffset + 2) {
      return null;
    }

    const value = buffer.toString("utf8", line.nextOffset, endOffset);
    return {
      value,
      nextOffset: endOffset + 2,
    };
  }

  if (prefix === "*") {
    const itemCount = Number(line.value);
    if (!Number.isInteger(itemCount)) {
      throw new Error("Invalid Redis array response length.");
    }

    if (itemCount < 0) {
      return {
        value: null,
        nextOffset: line.nextOffset,
      };
    }

    const values: RedisValue[] = [];
    let cursor = line.nextOffset;

    for (let index = 0; index < itemCount; index += 1) {
      const parsedItem = parseResp(buffer, cursor);
      if (!parsedItem) {
        return null;
      }

      if (parsedItem.value instanceof Error) {
        throw parsedItem.value;
      }

      values.push(parsedItem.value);
      cursor = parsedItem.nextOffset;
    }

    return {
      value: values,
      nextOffset: cursor,
    };
  }

  throw new Error(`Unsupported Redis response prefix: ${prefix}`);
}

function runRedisCommands(
  options: RedisConnectionOptions,
  commands: string[][],
): Promise<RedisValue[]> {
  return new Promise((resolve, reject) => {
    const socket = options.secure
      ? tls.connect({
          host: options.host,
          port: options.port,
          servername: options.host,
        })
      : net.connect({
          host: options.host,
          port: options.port,
        });

    const replies: RedisValue[] = [];
    let buffer = Buffer.alloc(0);
    let settled = false;

    function cleanup() {
      socket.removeAllListeners("connect");
      socket.removeAllListeners("data");
      socket.removeAllListeners("timeout");
      socket.removeAllListeners("error");
      socket.removeAllListeners("close");
    }

    function finishWithError(error: Error) {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      socket.destroy();
      reject(error);
    }

    function finishWithSuccess() {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      socket.end();
      resolve(replies);
    }

    socket.setTimeout(REDIS_TIMEOUT_MS);

    socket.once("connect", () => {
      try {
        const payload = Buffer.concat(commands.map((command) => encodeRedisCommand(command)));
        socket.write(payload);
      } catch (error) {
        finishWithError(
          error instanceof Error
            ? error
            : new Error("Could not encode Redis command payload."),
        );
      }
    });

    socket.on("data", (chunk) => {
      if (settled) {
        return;
      }

      buffer = Buffer.concat([buffer, chunk]);

      try {
        while (replies.length < commands.length) {
          const parsed = parseResp(buffer);
          if (!parsed) {
            break;
          }

          buffer = buffer.subarray(parsed.nextOffset);
          if (parsed.value instanceof Error) {
            finishWithError(parsed.value);
            return;
          }

          replies.push(parsed.value);
        }
      } catch (error) {
        finishWithError(
          error instanceof Error ? error : new Error("Could not parse Redis response."),
        );
        return;
      }

      if (replies.length === commands.length) {
        finishWithSuccess();
      }
    });

    socket.once("timeout", () => {
      finishWithError(new Error("Redis command timed out."));
    });

    socket.once("error", (error) => {
      finishWithError(error);
    });

    socket.once("close", () => {
      if (!settled) {
        finishWithError(new Error("Redis connection closed unexpectedly."));
      }
    });
  });
}

function getRateLimitResponse(
  response: RedisValue | undefined,
): RedisRateLimitResult | null {
  if (!Array.isArray(response) || response.length < 2) {
    return null;
  }

  const [countValue, ttlValue] = response;
  const count = Number(countValue);
  const ttlMs = Number(ttlValue);
  if (!Number.isFinite(count) || !Number.isFinite(ttlMs)) {
    return null;
  }

  return {
    count,
    ttlMs: Math.max(0, ttlMs),
  };
}

function markRedisUnavailable(error: unknown) {
  const now = Date.now();
  const state = getRedisState();
  state.disabledUntil = now + REDIS_UNAVAILABLE_COOLDOWN_MS;

  // Log at most once per minute to avoid noisy repeated warnings.
  if (now - state.lastWarningAt < 60_000) {
    return;
  }

  state.lastWarningAt = now;
  const message =
    error instanceof Error ? error.message : "Unknown Redis rate limit error.";
  console.warn(
    `[security] Redis rate limiter unavailable. Falling back to in-memory buckets for ${Math.ceil(
      REDIS_UNAVAILABLE_COOLDOWN_MS / 1_000,
    )}s. ${message}`,
  );
}

export async function consumeRedisRateLimit(input: {
  key: string;
  windowMs: number;
  maxRequests: number;
}) {
  const options = parseRedisConnectionOptions();
  if (!options) {
    return null;
  }

  const now = Date.now();
  const state = getRedisState();
  if (state.disabledUntil > now) {
    return null;
  }

  const redisKey = `${RATE_LIMIT_KEY_PREFIX}:${input.key}`;

  const commands: string[][] = [];
  if (options.password) {
    if (options.username) {
      commands.push(["AUTH", options.username, options.password]);
    } else {
      commands.push(["AUTH", options.password]);
    }
  }

  if (options.db > 0) {
    commands.push(["SELECT", String(options.db)]);
  }

  commands.push([
    "EVAL",
    RATE_LIMIT_SCRIPT,
    "1",
    redisKey,
    String(input.windowMs),
  ]);

  try {
    const responses = await runRedisCommands(options, commands);
    const rateLimitReply = responses[responses.length - 1];
    const parsed = getRateLimitResponse(rateLimitReply);
    if (!parsed) {
      throw new Error("Redis returned an unexpected rate limit response.");
    }

    return {
      count: parsed.count,
      ttlMs: parsed.ttlMs,
      limited: parsed.count > input.maxRequests,
    };
  } catch (error) {
    markRedisUnavailable(error);
    return null;
  }
}

