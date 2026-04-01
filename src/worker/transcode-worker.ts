import { prisma } from "@/lib/prisma";
import {
  popTranscodeQueueMessage,
  reportTranscodeWorkerHeartbeat,
} from "@/lib/transcode/queue";
import {
  enqueueDueQueuedRetryJobs,
  processTranscodeQueueMessage,
  recoverStaleQueuedTranscodeJobs,
} from "@/lib/transcode/worker";

const DEFAULT_CONCURRENCY = 1;
const DEFAULT_QUEUE_POLL_TIMEOUT_SECONDS = 5;
const DEFAULT_HEARTBEAT_INTERVAL_SECONDS = 10;
const DEFAULT_STALE_QUEUED_THRESHOLD_SECONDS = 900;
const DEFAULT_STALE_RECOVERY_INTERVAL_SECONDS = 30;
const DEFAULT_STALE_RECOVERY_BATCH_SIZE = 25;
const DEFAULT_RETRY_ENQUEUE_INTERVAL_SECONDS = 5;
const DEFAULT_RETRY_ENQUEUE_BATCH_SIZE = 25;
const ERROR_RETRY_DELAY_MS = 1_000;

function parsePositiveInteger(raw: string | undefined, fallback: number) {
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let shuttingDown = false;

async function workerLoop(input: {
  index: number;
  pollTimeoutSeconds: number;
  staleQueuedThresholdSeconds: number;
  staleRecoveryIntervalSeconds: number;
  staleRecoveryBatchSize: number;
  retryEnqueueIntervalSeconds: number;
  retryEnqueueBatchSize: number;
}) {
  let lastStaleRecoveryRunAt = 0;
  let lastRetryEnqueueRunAt = 0;

  while (!shuttingDown) {
    try {
      if (input.index === 1) {
        const nowMs = Date.now();

        if (
          lastRetryEnqueueRunAt === 0 ||
          nowMs - lastRetryEnqueueRunAt >= input.retryEnqueueIntervalSeconds * 1_000
        ) {
          const retrySummary = await enqueueDueQueuedRetryJobs({
            maxJobs: input.retryEnqueueBatchSize,
          });
          lastRetryEnqueueRunAt = Date.now();

          if (retrySummary.enqueued > 0 || retrySummary.failed > 0) {
            console.info(
              `[worker] retry enqueue scanned=${retrySummary.scanned} enqueued=${retrySummary.enqueued} failed=${retrySummary.failed} skipped=${retrySummary.skipped}`,
            );
          }
        }

        if (
          lastStaleRecoveryRunAt === 0 ||
          nowMs - lastStaleRecoveryRunAt >= input.staleRecoveryIntervalSeconds * 1_000
        ) {
          const summary = await recoverStaleQueuedTranscodeJobs({
            staleAfterSeconds: input.staleQueuedThresholdSeconds,
            maxJobs: input.staleRecoveryBatchSize,
          });
          lastStaleRecoveryRunAt = Date.now();

          if (summary.requeued > 0 || summary.failed > 0) {
            console.info(
              `[worker] stale queued recovery scanned=${summary.scanned} requeued=${summary.requeued} failed=${summary.failed} skipped=${summary.skipped}`,
            );
          }
        }
      }

      const message = await popTranscodeQueueMessage({
        timeoutSeconds: input.pollTimeoutSeconds,
      });

      if (!message) {
        continue;
      }

      await processTranscodeQueueMessage(message);
      console.info(
        `[worker] processed transcode message kind=${message.kind} jobId=${message.jobId} worker=${input.index}`,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown worker error.";
      console.error(
        `[worker] transcode processing error worker=${input.index}: ${errorMessage}`,
      );
      await sleep(ERROR_RETRY_DELAY_MS);
    }
  }
}

async function main() {
  const concurrency = parsePositiveInteger(
    process.env.TRANSCODE_CONCURRENCY,
    DEFAULT_CONCURRENCY,
  );
  const pollTimeoutSeconds = parsePositiveInteger(
    process.env.TRANSCODE_QUEUE_POLL_TIMEOUT_SECONDS,
    DEFAULT_QUEUE_POLL_TIMEOUT_SECONDS,
  );
  const staleQueuedThresholdSeconds = parsePositiveInteger(
    process.env.TRANSCODE_STALE_QUEUED_THRESHOLD_SECONDS,
    DEFAULT_STALE_QUEUED_THRESHOLD_SECONDS,
  );
  const heartbeatIntervalSeconds = parsePositiveInteger(
    process.env.TRANSCODE_WORKER_HEARTBEAT_INTERVAL_SECONDS,
    DEFAULT_HEARTBEAT_INTERVAL_SECONDS,
  );
  const staleRecoveryIntervalSeconds = parsePositiveInteger(
    process.env.TRANSCODE_STALE_RECOVERY_INTERVAL_SECONDS,
    DEFAULT_STALE_RECOVERY_INTERVAL_SECONDS,
  );
  const staleRecoveryBatchSize = parsePositiveInteger(
    process.env.TRANSCODE_STALE_RECOVERY_BATCH_SIZE,
    DEFAULT_STALE_RECOVERY_BATCH_SIZE,
  );
  const retryEnqueueIntervalSeconds = parsePositiveInteger(
    process.env.TRANSCODE_RETRY_ENQUEUE_INTERVAL_SECONDS,
    DEFAULT_RETRY_ENQUEUE_INTERVAL_SECONDS,
  );
  const retryEnqueueBatchSize = parsePositiveInteger(
    process.env.TRANSCODE_RETRY_ENQUEUE_BATCH_SIZE,
    DEFAULT_RETRY_ENQUEUE_BATCH_SIZE,
  );

  console.info(
    `[worker] starting transcode worker concurrency=${concurrency} pollTimeoutSeconds=${pollTimeoutSeconds} heartbeatIntervalSeconds=${heartbeatIntervalSeconds} staleQueuedThresholdSeconds=${staleQueuedThresholdSeconds} staleRecoveryIntervalSeconds=${staleRecoveryIntervalSeconds} staleRecoveryBatchSize=${staleRecoveryBatchSize} retryEnqueueIntervalSeconds=${retryEnqueueIntervalSeconds} retryEnqueueBatchSize=${retryEnqueueBatchSize}`,
  );

  const signalHandler = (signal: string) => {
    console.info(`[worker] received ${signal}; shutting down after current work.`);
    shuttingDown = true;
  };

  process.on("SIGINT", () => signalHandler("SIGINT"));
  process.on("SIGTERM", () => signalHandler("SIGTERM"));

  const heartbeatTtlSeconds = Math.max(30, heartbeatIntervalSeconds * 3);
  await reportTranscodeWorkerHeartbeat({
    ttlSeconds: heartbeatTtlSeconds,
  }).catch(() => undefined);
  const heartbeatIntervalId = setInterval(() => {
    void reportTranscodeWorkerHeartbeat({
      ttlSeconds: heartbeatTtlSeconds,
    }).catch(() => undefined);
  }, heartbeatIntervalSeconds * 1_000);

  const workers = Array.from({ length: concurrency }, (_, index) =>
    workerLoop({
      index: index + 1,
      pollTimeoutSeconds,
      staleQueuedThresholdSeconds,
      staleRecoveryIntervalSeconds,
      staleRecoveryBatchSize,
      retryEnqueueIntervalSeconds,
      retryEnqueueBatchSize,
    }),
  );

  try {
    await Promise.all(workers);
  } finally {
    clearInterval(heartbeatIntervalId);
    await prisma.$disconnect().catch(() => undefined);
  }
}

void main().catch(async (error) => {
  const errorMessage = error instanceof Error ? error.message : "Unknown startup error.";
  console.error(`[worker] fatal error: ${errorMessage}`);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
