import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Verdict {
  grammarCode: string;
  valid: boolean;
  reasons: string[];
}

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      minItems: 1,
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['grammarCode', 'valid', 'reasons'],
        properties: {
          grammarCode: { type: 'string' },
          valid: { type: 'boolean' },
          reasons: { type: 'array', maxItems: 5, items: { type: 'string' } },
        },
      },
    },
  },
} as const;

const loadEnvironment = (): void => {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]!]) continue;
    process.env[match[1]!] = match[2]!.replace(/^['"]|['"]$/g, '');
  }
};

async function validateBatch(
  apiKey: string,
  model: string,
  items: Array<Record<string, unknown>>,
): Promise<Verdict[]> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model,
      reasoning: { effort: 'medium' },
      instructions:
        'Bạn là biên tập viên độc lập, không phải tác giả. Đánh giá nghiêm từng bài TRANSFORM_SENTENCE. valid chỉ khi: câu nguồn và đáp án tự nhiên; thao tác thật sự biến đổi cấu trúc; đáp án bắt buộc dùng target grammar; câu nguồn không vốn đã hoàn thành đúng target theo cùng cách; chủ thể/người/số lượng/sự kiện/từ nội dung/polarity/time reference được giữ theo goal; goal tiếng Việt rõ và không tiết lộ đáp án. Thay đổi từ đồng nghĩa, thêm trạng từ vô ích, đổi đại từ hoặc chỉ chép lại đều invalid. Trả đúng một verdict cho mỗi grammarCode.',
      input: JSON.stringify({ items }),
      text: { format: { type: 'json_schema', name: 'transform_preflight', strict: true, schema } },
    }),
  });
  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    error?: { code?: string };
  };
  const text =
    payload.output_text ??
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .find((content) => content.type === 'output_text')?.text;
  if (!response.ok || !text) throw new Error(`OPENAI_${payload.error?.code ?? response.status}`);
  const parsed = JSON.parse(text) as { verdicts?: Verdict[] };
  if (!Array.isArray(parsed.verdicts) || parsed.verdicts.length !== items.length)
    throw new Error('PREFLIGHT_COUNT_INVALID');
  return parsed.verdicts;
}

async function main(): Promise<void> {
  loadEnvironment();
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.TRANSFORM_REVIEW_MODEL ?? 'gpt-5-mini';
  if (!apiKey) throw new Error('OPENAI_API_KEY is required');
  const exercises = await prisma.exercise.findMany({
    where: { type: 'TRANSFORM_SENTENCE', contentStatus: 'PUBLISHED' },
    orderBy: { contentKey: 'asc' },
    select: {
      id: true,
      contentKey: true,
      constraintsJson: true,
      sentences: {
        take: 1,
        select: { referenceAnswersJson: true, semanticRequirementsJson: true },
      },
      targets: {
        take: 1,
        select: {
          grammarPointVersion: {
            select: {
              title: true,
              formSummary: true,
              meaningSummary: true,
              grammarPoint: { select: { code: true } },
            },
          },
        },
      },
    },
  });
  const report: Array<Verdict & { contentKey: string }> = [];
  for (let offset = 0; offset < exercises.length; offset += 8) {
    const batch = exercises.slice(offset, offset + 8);
    const verdicts = await validateBatch(
      apiKey,
      model,
      batch.map((exercise) => ({
        grammarCode: exercise.targets[0]?.grammarPointVersion.grammarPoint.code,
        targetTitle: exercise.targets[0]?.grammarPointVersion.title,
        targetForm: exercise.targets[0]?.grammarPointVersion.formSummary,
        targetMeaning: exercise.targets[0]?.grammarPointVersion.meaningSummary,
        promptPayload: exercise.constraintsJson,
        referenceAnswer: (exercise.sentences[0]?.referenceAnswersJson as string[] | undefined)?.[0],
        requirements: exercise.sentences[0]?.semanticRequirementsJson,
      })),
    );
    const byCode = new Map(verdicts.map((verdict) => [verdict.grammarCode, verdict]));
    for (const exercise of batch) {
      const code = exercise.targets[0]?.grammarPointVersion.grammarPoint.code ?? '';
      const verdict = byCode.get(code);
      if (!verdict) throw new Error(`PREFLIGHT_MISSING:${code}`);
      report.push({ ...verdict, contentKey: exercise.contentKey });
      if (!verdict.valid)
        await prisma.exercise.update({
          where: { id: exercise.id },
          data: { contentStatus: 'RETIRED' },
        });
    }
    console.log(
      `Reviewed ${Math.min(offset + batch.length, exercises.length)}/${exercises.length}`,
    );
  }
  await mkdir('reports', { recursive: true });
  await writeFile(
    'reports/transform-activity-preflight.json',
    `${JSON.stringify({ model, reviewedAt: new Date().toISOString(), verdicts: report }, null, 2)}\n`,
    'utf8',
  );
  console.log(
    `Preflight complete: ${report.filter((item) => item.valid).length} valid, ${report.filter((item) => !item.valid).length} retired.`,
  );
}

void main().finally(() => prisma.$disconnect());
