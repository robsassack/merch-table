import net from "node:net";
import tls from "node:tls";

type RedisValue = string | number | null | RedisValue[];
type ParsedResp = {
  value: RedisValue | Error;
  nextOffset: number;
};

type RedisConnectionOptions = {
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  password: string | null;
  db: number;
};

const REDIS_TIMEOUT_MS = 2_500;
const DEFAULT_TRANSCODE_QUEUE_KEY = "merch-table:transcode:queue";

export type TranscodeQueueMessage =
  | {
      version: 1;
      kind: "PREVIEW_CLIP";
      jobId: string;
      enqueuedAt: string;
    }
  | {
      version: 1;
      kind: "DELIVERY_FORMATS";
      jobId: string;
      enqueuedAt: string;
    };

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
    throw new Error("REDIS_URL is required for transcode queue operations.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(redisUrl);
  } catch {
    throw new Error("REDIS_URL is not a valid URL.");
  }

  if (!['redis:', 'rediss:'].includes(parsedUrl.protocol)) {
    throw new Error("REDIS_URL must use redis:// or rediss:// protocol.");
  }

  const host = parsedUrl.hostname;
  if (!host) {
    throw new Error("REDIS_URL must include a host.");
  }

  const secure = parsedUrl.protocol === "rediss:";

  return {
    host,
    port: parseInteger(parsedUrl.port, secure ? 6380 : 6379),
    secure,
    username: parsedUrl.username ? decodeURIComponent(parsedUrl.username) : null,
    password: parsedUrl.password ? decodeURIComponent(parsedUrl.password) : null,
    db: parseInteger(parsedUrl.pathname.replace(/^\//, ""), 0),
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

    return {
      value: buffer.toString("utf8", line.nextOffset, endOffset),
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
  input?: { timeoutMs?: number },
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

    socket.setTimeout(input?.timeoutMs ?? REDIS_TIMEOUT_MS);

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

function parseQueueMessage(raw: string): TranscodeQueueMessage | null {
  try {
    const parsed = JSON.parse(raw) as Partial<TranscodeQueueMessage>;
    if (!parsed || parsed.version !== 1 || typeof parsed.jobId !== "string") {
      return null;
    }

    if (parsed.kind !== "PREVIEW_CLIP" && parsed.kind !== "DELIVERY_FORMATS") {
      return null;
    }

    if (typeof parsed.enqueuedAt !== "string") {
      return null;
    }

    return {
      version: 1,
      kind: parsed.kind,
      jobId: parsed.jobId,
      enqueuedAt: parsed.enqueuedAt,
    };
  } catch {
    return null;
  }
}

function buildRedisCommandSet(commands: string[][]) {
  const options = parseRedisConnectionOptions();
  const authAndDbCommands: string[][] = [];

  if (options.password) {
    if (options.username) {
      authAndDbCommands.push(["AUTH", options.username, options.password]);
    } else {
      authAndDbCommands.push(["AUTH", options.password]);
    }
  }

  if (options.db > 0) {
    authAndDbCommands.push(["SELECT", String(options.db)]);
  }

  return {
    options,
    commands: [...authAndDbCommands, ...commands],
  };
}

export function getTranscodeQueueKey() {
  const raw = process.env.TRANSCODE_QUEUE_KEY?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_TRANSCODE_QUEUE_KEY;
}

export async function enqueueTranscodeQueueMessage(message: Omit<TranscodeQueueMessage, "version" | "enqueuedAt">) {
  const queueKey = getTranscodeQueueKey();
  const serialized = JSON.stringify({
    version: 1,
    kind: message.kind,
    jobId: message.jobId,
    enqueuedAt: new Date().toISOString(),
  } satisfies TranscodeQueueMessage);

  const request = buildRedisCommandSet([["RPUSH", queueKey, serialized]]);
  await runRedisCommands(request.options, request.commands);
}

export async function popTranscodeQueueMessage(input?: { timeoutSeconds?: number }) {
  const timeoutSeconds = Math.max(1, Math.floor(input?.timeoutSeconds ?? 5));
  const queueKey = getTranscodeQueueKey();

  const request = buildRedisCommandSet([["BLPOP", queueKey, String(timeoutSeconds)]]);
  const responses = await runRedisCommands(request.options, request.commands, {
    timeoutMs: (timeoutSeconds + 2) * 1_000,
  });

  const result = responses[responses.length - 1];
  if (result === null) {
    return null;
  }

  if (!Array.isArray(result) || result.length < 2) {
    throw new Error("Redis queue returned an unexpected BLPOP response.");
  }

  const payload = result[1];
  if (typeof payload !== "string") {
    throw new Error("Redis queue returned a non-string payload.");
  }

  const parsed = parseQueueMessage(payload);
  if (!parsed) {
    throw new Error("Redis queue payload was not a valid transcode message.");
  }

  return parsed;
}

export async function enqueuePreviewClipJob(jobId: string) {
  await enqueueTranscodeQueueMessage({
    kind: "PREVIEW_CLIP",
    jobId,
  });
}

export async function enqueueDeliveryFormatsJob(jobId: string) {
  await enqueueTranscodeQueueMessage({
    kind: "DELIVERY_FORMATS",
    jobId,
  });
}
