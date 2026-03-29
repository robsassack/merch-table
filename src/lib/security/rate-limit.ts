import { NextResponse } from "next/server";

type RateLimitPolicy = {
  id: string;
  maxRequests: number;
  windowMs: number;
};

type RateLimitOptions = {
  key?: string;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitStore = {
  buckets: Map<string, RateLimitBucket>;
  operations: number;
};

const STORE_KEY = "__merch_table_rate_limit_store__";

function getStore() {
  const globalScope = globalThis as typeof globalThis & {
    [STORE_KEY]?: RateLimitStore;
  };

  if (!globalScope[STORE_KEY]) {
    globalScope[STORE_KEY] = {
      buckets: new Map<string, RateLimitBucket>(),
      operations: 0,
    };
  }

  return globalScope[STORE_KEY];
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

function cleanupExpiredBuckets(store: RateLimitStore, now: number) {
  for (const [key, bucket] of store.buckets) {
    if (bucket.resetAt <= now) {
      store.buckets.delete(key);
    }
  }
}

export function enforceRateLimit(
  request: Request,
  policy: RateLimitPolicy,
  options: RateLimitOptions = {},
) {
  const now = Date.now();
  const store = getStore();

  if (store.operations % 200 === 0) {
    cleanupExpiredBuckets(store, now);
  }

  store.operations += 1;

  const key = `${policy.id}:${options.key ?? getClientIp(request)}`;
  const existing = store.buckets.get(key);
  const bucket =
    existing && existing.resetAt > now
      ? existing
      : {
          count: 0,
          resetAt: now + policy.windowMs,
        };

  if (bucket.count >= policy.maxRequests) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((bucket.resetAt - now) / 1_000),
    );

    return NextResponse.json(
      {
        error: `Too many requests. Try again in ${retryAfterSeconds} seconds.`,
      },
      {
        status: 429,
        headers: {
          "retry-after": String(retryAfterSeconds),
        },
      },
    );
  }

  bucket.count += 1;
  store.buckets.set(key, bucket);
  return null;
}
