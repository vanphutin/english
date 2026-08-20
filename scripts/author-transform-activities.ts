import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AuthoredTransform {
  grammarCode: string;
  contextVi: string;
  sourceSentence: string;
  transformationGoalVi: string;
  transformedAnswer: string;
  meaningVi: string;
  preservedAnchors: string[];
  requirements: string[];
}

const batchSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['activities'],
  properties: {
    activities: {
      type: 'array',
      minItems: 1,
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'grammarCode',
          'contextVi',
          'sourceSentence',
          'transformationGoalVi',
          'transformedAnswer',
          'meaningVi',
          'preservedAnchors',
          'requirements',
        ],
        properties: {
          grammarCode: { type: 'string' },
          contextVi: { type: 'string' },
          sourceSentence: { type: 'string' },
          transformationGoalVi: { type: 'string' },
          transformedAnswer: { type: 'string' },
          meaningVi: { type: 'string' },
          preservedAnchors: {
            type: 'array',
            minItems: 1,
            maxItems: 8,
            items: { type: 'string' },
          },
          requirements: {
            type: 'array',
            minItems: 1,
            maxItems: 5,
            items: { type: 'string' },
          },
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

const outputText = (payload: {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
}): string | undefined =>
  payload.output_text ??
  payload.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === 'output_text')?.text;

async function authorBatch(
  apiKey: string,
  model: string,
  points: Array<Record<string, unknown>>,
): Promise<AuthoredTransform[]> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model,
      reasoning: { effort: 'low' },
      instructions:
        'Bạn biên soạn bài TRANSFORM_SENTENCE Anh-Việt. Với mỗi grammarCode, tạo đúng một câu nguồn tiếng Anh và một câu biến đổi khác hình thức nhưng giữ CHÍNH XÁC chủ thể, người, số lượng, sự kiện, từ vựng nội dung, polarity và time reference. Không được đổi I/you/he/she/it/we/they, tên riêng, con số, nghề nghiệp, địa điểm hoặc hành động cốt lõi. Chỉ thay đổi cấu trúc ngữ pháp để bắt buộc dùng target. transformationGoalVi phải bắt đầu bằng “Hãy” và viết hoàn toàn bằng tiếng Việt, nói rõ thao tác nhưng không tiết lộ đáp án. preservedAnchors liệt kê mọi đại từ, tên riêng, con số và từ nội dung bắt buộc xuất hiện nguyên văn ở cả câu nguồn lẫn đáp án. Câu nguồn và đáp án không được giống nhau sau chuẩn hóa. requirements viết bằng tiếng Anh và phải nêu rõ preserve subject, polarity, time reference. Chỉ trả JSON theo schema.',
      input: JSON.stringify({ grammarPoints: points }),
      text: {
        format: {
          type: 'json_schema',
          name: 'transform_activity_batch',
          strict: true,
          schema: batchSchema,
        },
      },
    }),
  });
  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    error?: { code?: string };
  };
  const text = outputText(payload);
  if (!response.ok || !text) throw new Error(`OPENAI_${payload.error?.code ?? response.status}`);
  const parsed = JSON.parse(text) as { activities?: AuthoredTransform[] };
  if (!Array.isArray(parsed.activities) || parsed.activities.length !== points.length)
    throw new Error('TRANSFORM_BATCH_COUNT_INVALID');
  const expectedCodes = new Set(points.map((point) => String(point.code)));
  for (const item of parsed.activities) {
    if (!expectedCodes.has(item.grammarCode)) throw new Error('TRANSFORM_GRAMMAR_CODE_INVALID');
    const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
    if (normalize(item.sourceSentence) === normalize(item.transformedAnswer))
      throw new Error(`TRANSFORM_IDENTICAL:${item.grammarCode}`);
    if (
      !item.contextVi ||
      !item.transformationGoalVi.startsWith('Hãy') ||
      !/[ăâđêôơưáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ]/iu.test(item.transformationGoalVi) ||
      !item.meaningVi ||
      !item.requirements.length ||
      !item.preservedAnchors.length
    )
      throw new Error(`TRANSFORM_INCOMPLETE:${item.grammarCode}`);
    const source = normalize(item.sourceSentence);
    const answer = normalize(item.transformedAnswer);
    if (
      item.preservedAnchors.some((anchor) => {
        const normalizedAnchor = normalize(anchor);
        return !source.includes(normalizedAnchor) || !answer.includes(normalizedAnchor);
      })
    )
      throw new Error(`TRANSFORM_ANCHOR_MISSING:${item.grammarCode}`);
  }
  return parsed.activities;
}

/** Invalid model batches are retried, then split; malformed output is never coerced or published. */
async function authorValidated(
  apiKey: string,
  model: string,
  points: Array<Record<string, unknown>>,
): Promise<AuthoredTransform[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await authorBatch(apiKey, model, points);
    } catch (error: unknown) {
      lastError = error;
    }
  }
  if (points.length === 1) throw lastError;
  const midpoint = Math.ceil(points.length / 2);
  const left = await authorValidated(apiKey, model, points.slice(0, midpoint));
  const right = await authorValidated(apiKey, model, points.slice(midpoint));
  return [...left, ...right];
}

async function main(): Promise<void> {
  loadEnvironment();
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? 'gpt-5-nano';
  if (!apiKey) throw new Error('OPENAI_API_KEY is required');
  const versions = await prisma.grammarPointVersion.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: [{ cefrLevel: 'asc' }, { title: 'asc' }],
    select: {
      id: true,
      cefrLevel: true,
      title: true,
      shortDescription: true,
      formSummary: true,
      meaningSummary: true,
      grammarPoint: { select: { code: true } },
      rules: { orderBy: { priority: 'asc' }, take: 3, select: { description: true } },
      examples: { orderBy: { sortOrder: 'asc' }, take: 2, select: { englishText: true } },
    },
  });
  const pending = [];
  for (const version of versions) {
    const contentKey = `${version.cefrLevel}_${version.grammarPoint.code}_TRANSFORM_2`;
    const exists = await prisma.exercise.findUnique({
      where: { contentKey },
      select: { id: true },
    });
    if (!exists) pending.push({ version, contentKey });
  }
  let created = 0;
  for (let offset = 0; offset < pending.length; offset += 8) {
    const batch = pending.slice(offset, offset + 8);
    const authored = await authorValidated(
      apiKey,
      model,
      batch.map(({ version }) => ({
        code: version.grammarPoint.code,
        cefr: version.cefrLevel,
        title: version.title,
        objective: version.shortDescription,
        form: version.formSummary,
        meaning: version.meaningSummary,
        rules: version.rules,
        examples: version.examples,
      })),
    );
    const byCode = new Map(authored.map((item) => [item.grammarCode, item]));
    for (const { version, contentKey } of batch) {
      const item = byCode.get(version.grammarPoint.code);
      if (!item) throw new Error(`TRANSFORM_MISSING:${version.grammarPoint.code}`);
      await prisma.exercise.create({
        data: {
          contentKey,
          origin: 'AI_DRAFT_VALIDATED',
          type: 'TRANSFORM_SENTENCE',
          contentStatus: 'PUBLISHED',
          generatorVersion: `openai-transform-author-v2:${model}`,
          evaluatorRubricVersion: 'layered-activity-v1',
          locale: 'vi',
          difficulty: 2,
          promptContextVi: item.contextVi,
          instructionVi: 'Viết lại câu theo yêu cầu mà vẫn giữ nguyên ý nghĩa cốt lõi.',
          semanticHash: createHash('sha256')
            .update(`transform:${item.transformedAnswer.toLowerCase()}`)
            .digest('hex'),
          topicCode: 'DAILY_LIFE',
          constraintsJson: {
            schemaVersion: '1.0',
            promptPayload: {
              sourceSentence: item.sourceSentence,
              transformationGoalVi: item.transformationGoalVi,
              preservedAnchors: item.preservedAnchors,
            },
          },
          contentSnapshotJson: {
            source: 'openai-authored-validated-transform-v2',
            model,
            grammarCode: version.grammarPoint.code,
            validation: [
              'SCHEMA_VALID',
              'SOURCE_DIFFERS_FROM_ANSWER',
              'PRESERVED_ANCHORS_PRESENT',
              'VIETNAMESE_GOAL_VALID',
              'TARGET_PINNED',
            ],
          },
          targets: { create: { grammarPointVersionId: version.id, targetRole: 'PRIMARY' } },
          sentences: {
            create: {
              position: 0,
              sourceTextVi: item.meaningVi,
              referenceAnswersJson: [item.transformedAnswer],
              semanticRequirementsJson: item.requirements,
            },
          },
        },
      });
      created += 1;
    }
    console.log(`Authored ${Math.min(offset + batch.length, pending.length)}/${pending.length}`);
  }
  if (created > 0 || pending.length === 0)
    await prisma.exercise.updateMany({
      where: { type: 'TRANSFORM_SENTENCE', contentKey: { endsWith: '_TRANSFORM_1' } },
      data: { contentStatus: 'RETIRED' },
    });
  console.log(`Created ${created} validated transformation activities.`);
}

void main().finally(() => prisma.$disconnect());
