import 'dotenv/config';
import { hostname } from 'node:os';
import { PrismaClient } from '@prisma/client';
import { LayeredEvaluationProvider, PrismaEvaluationProcessor } from '@english/evaluation';
import { PrismaLearningRepository } from '@english/learning';

const positiveInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const prisma = new PrismaClient();
const workerId = process.env.WORKER_ID || `${hostname()}-${process.pid}`;
const pollMs = positiveInteger(process.env.WORKER_POLL_MS, 1000);
const processor = new PrismaEvaluationProcessor(
  prisma,
  new LayeredEvaluationProvider(
    process.env.OPENAI_API_KEY || undefined,
    process.env.OPENAI_MODEL || 'gpt-5-mini',
  ),
  new PrismaLearningRepository(prisma),
  {
    maxAttempts: positiveInteger(process.env.WORKER_MAX_ATTEMPTS, 4),
    leaseSeconds: positiveInteger(process.env.WORKER_LEASE_SECONDS, 90),
  },
);

let stopping = false;
const stop = (): void => {
  stopping = true;
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

const run = async (): Promise<void> => {
  const once = process.argv.includes('--once');
  console.log(JSON.stringify({ event: 'worker_started', workerId, pollMs, once }));
  try {
    do {
      const result = await processor.processNext(workerId);
      if (result.state !== 'IDLE') console.log(JSON.stringify({ event: 'job_result', ...result }));
      if (once) break;
      if (result.state === 'IDLE') await new Promise((resolve) => setTimeout(resolve, pollMs));
    } while (!stopping);
  } finally {
    await prisma.$disconnect();
    console.log(JSON.stringify({ event: 'worker_stopped', workerId }));
  }
};

void run().catch((error: unknown) => {
  const errorCode = error instanceof Error ? error.name : 'UNKNOWN_ERROR';
  console.error(JSON.stringify({ event: 'worker_fatal', workerId, errorCode }));
  process.exitCode = 1;
});
