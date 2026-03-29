import { NextResponse } from "next/server";
import crypto from "node:crypto";

import { consumeRedisRateLimit } from "@/lib/security/redis-rate-limit";

export type RateLimitPolicy = {
  id: string;
  maxRequests: number;
  windowMs: number;
};

type RateLimitOptions = {
  key?: string;
};

type RateLimitResult = {
  limited: boolean;
  retryAfterSeconds: number;
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

function readBooleanEnv(name: string, fallback: boolean) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) {
    return fallback;
  }

  if (["1", "true", "yes", "on"].includes(raw)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(raw)) {
    return false;
  }

  return fallback;
}

function normalizeIdentifier(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, 128);
}

function parseForwardedForHeader(forwarded: string | null) {
  if (!forwarded) {
    return null;
  }

  const first = forwarded.split(",")[0]?.trim();
  return normalizeIdentifier(first);
}

function parseForwardedHeader(forwarded: string | null) {
  if (!forwarded) {
    return null;
  }

  const match = forwarded.match(/\bfor="?([^;,\s"]+)/i);
  return normalizeIdentifier(match?.[1] ?? null);
}

function shouldTrustProxyHeaders() {
  return readBooleanEnv("TRUST_PROXY_HEADERS", false);
}

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
  if (!shouldTrustProxyHeaders()) {
    return "unknown";
  }

  const providerIp =
    normalizeIdentifier(request.headers.get("cf-connecting-ip")) ??
    normalizeIdentifier(request.headers.get("x-real-ip"));
  if (providerIp) {
    return providerIp;
  }

  const forwardedFor = parseForwardedForHeader(
    request.headers.get("x-forwarded-for"),
  );
  if (forwardedFor) {
    return forwardedFor;
  }

  const forwarded = parseForwardedHeader(request.headers.get("forwarded"));
  if (forwarded) {
    return forwarded;
  }

  return "unknown";
}

function buildIdentityKey(value: string) {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

function cleanupExpiredBuckets(store: RateLimitStore, now: number) {
  for (const [key, bucket] of store.buckets) {
    if (bucket.resetAt <= now) {
      store.buckets.delete(key);
    }
  }
}

function consumeInMemoryRateLimit(
  policy: RateLimitPolicy,
  key: string,
): RateLimitResult {
  const now = Date.now();
  const store = getStore();

  if (store.operations % 200 === 0) {
    cleanupExpiredBuckets(store, now);
  }

  store.operations += 1;

  const existing = store.buckets.get(key);
  const bucket =
    existing && existing.resetAt > now
      ? existing
      : {
          count: 0,
          resetAt: now + policy.windowMs,
        };

  bucket.count += 1;
  store.buckets.set(key, bucket);

  return {
    limited: bucket.count > policy.maxRequests,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)),
  };
}

export function createHashedRateLimitKey(value: string) {
  return buildIdentityKey(value.trim().toLowerCase());
}

export async function consumeRateLimit(
  request: Request,
  policy: RateLimitPolicy,
  options: RateLimitOptions = {},
) {
  const identity = options.key ?? `ip:${getClientIp(request)}`;
  const key = `${policy.id}:${buildIdentityKey(identity)}`;

  const distributedResult = await consumeRedisRateLimit({
    key,
    windowMs: policy.windowMs,
    maxRequests: policy.maxRequests,
  });
  if (distributedResult) {
    return {
      limited: distributedResult.limited,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil(distributedResult.ttlMs / 1_000),
      ),
    };
  }

  return consumeInMemoryRateLimit(policy, key);
}

export async function enforceRateLimit(
  request: Request,
  policy: RateLimitPolicy,
  options: RateLimitOptions = {},
) {
  const result = await consumeRateLimit(request, policy, options);
  if (!result.limited) {
    return null;
  }

  return NextResponse.json(
    {
      error: `Too many requests. Try again in ${result.retryAfterSeconds} seconds.`,
    },
    {
      status: 429,
      headers: {
        "retry-after": String(result.retryAfterSeconds),
      },
    },
  );
}
