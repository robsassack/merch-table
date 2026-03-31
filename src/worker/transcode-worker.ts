import { prisma } from "@/lib/prisma";
import { popTranscodeQueueMessage } from "@/lib/transcode/queue";
import { processTranscodeQueueMessage } from "@/lib/transcode/worker";

const DEFAULT_CONCURRENCY = 1;
const DEFAULT_QUEUE_POLL_TIMEOUT_SECONDS = 5;
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

async function workerLoop(input: { index: number; pollTimeoutSeconds: number }) {
  while (!shuttingDown) {
    try {
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

  console.info(
    `[worker] starting transcode worker concurrency=${concurrency} pollTimeoutSeconds=${pollTimeoutSeconds}`,
  );

  const signalHandler = (signal: string) => {
    console.info(`[worker] received ${signal}; shutting down after current work.`);
    shuttingDown = true;
  };

  process.on("SIGINT", () => signalHandler("SIGINT"));
  process.on("SIGTERM", () => signalHandler("SIGTERM"));

  const workers = Array.from({ length: concurrency }, (_, index) =>
    workerLoop({
      index: index + 1,
      pollTimeoutSeconds,
    }),
  );

  try {
    await Promise.all(workers);
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

void main().catch(async (error) => {
  const errorMessage = error instanceof Error ? error.message : "Unknown startup error.";
  console.error(`[worker] fatal error: ${errorMessage}`);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
