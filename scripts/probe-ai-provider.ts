import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { OpenAiCompatibleClient, probeOpenAiCompatibleProvider } from '@english/operations';

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const positiveInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

async function main(): Promise<void> {
  const baseUrl = process.env.SECONDARY_AI_BASE_URL;
  const apiKey = process.env.SECONDARY_AI_API_KEY;
  const allowedHost = process.env.SECONDARY_AI_ALLOWED_HOST;
  if (!baseUrl || !apiKey || !allowedHost)
    throw new Error(
      'SECONDARY_AI_BASE_URL, SECONDARY_AI_ALLOWED_HOST, and SECONDARY_AI_API_KEY are required',
    );

  const client = new OpenAiCompatibleClient({
    name: 'SECONDARY_OPENAI_COMPATIBLE',
    baseUrl,
    apiKey,
    allowedHosts: [allowedHost],
    timeoutMs: positiveInteger(process.env.SECONDARY_AI_TIMEOUT_MS, 30_000),
    maxTransientRetries: Math.min(
      2,
      positiveInteger(process.env.SECONDARY_AI_MAX_TRANSIENT_RETRIES, 2),
    ),
  });
  const requestedModel = argument('--model') ?? process.env.SECONDARY_AI_MODEL;
  const report = await probeOpenAiCompatibleProvider(client, {
    provider: 'SECONDARY_OPENAI_COMPATIBLE',
    ...(requestedModel ? { requestedModel } : {}),
  });
  const outputPath = resolve(argument('--output') ?? 'reports/ai-provider-capability-report.json');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(
    JSON.stringify({
      status: report.status,
      provider: report.provider,
      baseHost: report.baseHost,
      selectedModel: report.selectedModel ?? null,
      modelCount: report.models.length,
      checks: report.checks.map((item) => ({
        capability: item.capability,
        status: item.status,
        ...(item.errorCode ? { errorCode: item.errorCode } : {}),
      })),
      reportPath: outputPath,
    }),
  );
  if (report.status !== 'VERIFIED') process.exitCode = 2;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Provider probe failed');
  process.exitCode = 1;
});
