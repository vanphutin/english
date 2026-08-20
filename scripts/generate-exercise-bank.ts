import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type GeneratedExercise = {
  topic: string;
  contextVi: string;
  sourceVi: string;
  answers: string[];
  requirements: string[];
  vocabulary: {
    lemma: string;
    partOfSpeech: string;
    definitionVi: string;
    hints: [string, string, string];
  };
};

const outputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['exercises'],
  properties: {
    exercises: {
      type: 'array',
      minItems: 1,
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['topic', 'contextVi', 'sourceVi', 'answers', 'requirements', 'vocabulary'],
        properties: {
          topic: { type: 'string' },
          contextVi: { type: 'string' },
          sourceVi: { type: 'string' },
          answers: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string' } },
          requirements: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string' } },
          vocabulary: {
            type: 'object',
            additionalProperties: false,
            required: ['lemma', 'partOfSpeech', 'definitionVi', 'hints'],
            properties: {
              lemma: { type: 'string' },
              partOfSpeech: { type: 'string' },
              definitionVi: { type: 'string' },
              hints: {
                type: 'array',
                minItems: 3,
                maxItems: 3,
                items: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
} as const;

const normalize = (value: string): string =>
  value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');

const localEnvironment = (): void => {
  try {
    for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]!]) continue;
      process.env[match[1]!] = match[2]!.replace(/^['"]|['"]$/g, '');
    }
  } catch {
    // Environment variables supplied by the process remain authoritative.
  }
};

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const validateBatch = (
  raw: unknown,
  expectedCount: number,
  existingSources: Set<string>,
): GeneratedExercise[] => {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { exercises?: unknown }).exercises))
    throw new Error('INVALID_GENERATOR_OUTPUT');
  const exercises = (raw as { exercises: GeneratedExercise[] }).exercises;
  if (exercises.length !== expectedCount) throw new Error('WRONG_EXERCISE_COUNT');
  const seen = new Set(existingSources);
  for (const exercise of exercises) {
    if (
      !exercise.contextVi?.trim() ||
      !exercise.sourceVi?.trim() ||
      !exercise.topic?.trim() ||
      !exercise.answers?.length ||
      !exercise.requirements?.length ||
      exercise.vocabulary?.hints?.length !== 3
    )
      throw new Error('INCOMPLETE_EXERCISE');
    const normalized = normalize(exercise.sourceVi);
    if (seen.has(normalized)) throw new Error(`DUPLICATE_SOURCE: ${exercise.sourceVi}`);
    seen.add(normalized);
  }
  return exercises;
};

async function generate(
  apiKey: string,
  model: string,
  point: {
    code: string;
    version: {
      cefrLevel: string;
      title: string;
      shortDescription: string;
      formSummary: string;
      meaningSummary: string;
      usageNotes: string | null;
      rules: Array<{ description: string }>;
      examples: Array<{ englishText: string; vietnameseText: string }>;
    };
  },
  count: number,
  existing: string[],
): Promise<GeneratedExercise[]> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model,
      reasoning: { effort: 'low' },
      instructions:
        'Bạn là biên tập viên bài tập ngữ pháp Anh-Việt. Tạo đúng số bài dịch câu được yêu cầu. Mỗi bài phải tự nhiên, đủ ngữ cảnh để đánh giá ngữ pháp mục tiêu, khác rõ rệt về chủ đề/động từ/chủ ngữ/thời gian, phù hợp CEFR, không mơ hồ và không sao chép các câu đã có. Câu trả lời mẫu không phải đáp án duy nhất. requirements viết bằng tiếng Anh, mô tả nghĩa và hình thức bắt buộc. Ba gợi ý từ vựng tăng dần nhưng không tiết lộ toàn bộ đáp án. Chỉ trả JSON theo schema.',
      input: JSON.stringify({
        requestedCount: count,
        grammarPoint: point,
        topicsToDistribute: [
          'daily life',
          'family',
          'study',
          'work',
          'travel',
          'shopping',
          'health',
          'technology',
          'community',
          'nature',
          'plans',
          'past experiences',
        ],
        existingSourceSentences: existing,
      }),
      text: {
        format: {
          type: 'json_schema',
          name: 'exercise_authoring_batch',
          strict: true,
          schema: outputSchema,
        },
      },
    }),
  });
  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    error?: { message?: string; code?: string };
  };
  const outputText =
    payload.output_text ??
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .find((content) => content.type === 'output_text')?.text;
  if (!response.ok || !outputText)
    throw new Error(`OPENAI_${payload.error?.code ?? response.status}`);
  return validateBatch(JSON.parse(outputText) as unknown, count, new Set(existing.map(normalize)));
}

async function persist(
  point: { id: string; code: string; version: { id: string; cefrLevel: string } },
  generated: GeneratedExercise[],
  model: string,
  startingIndex: number,
): Promise<void> {
  for (const [offset, item] of generated.entries()) {
    const sequence = startingIndex + offset;
    const contentKey = `${point.version.cefrLevel}_${point.code}_${String(sequence).padStart(3, '0')}`;
    const semanticHash = createHash('sha256').update(normalize(item.sourceVi)).digest('hex');
    const exercise = await prisma.exercise.upsert({
      where: { contentKey },
      update: {},
      create: {
        contentKey,
        origin: 'AI_DRAFT',
        type: 'TRANSLATE_CONTEXT',
        contentStatus: 'PUBLISHED',
        generatorVersion: 'openai-exercise-author-v2',
        evaluatorRubricVersion: 'deterministic-v1',
        locale: 'vi',
        difficulty: 1,
        promptContextVi: item.contextVi,
        instructionVi: 'Dịch câu tiếng Việt sang tiếng Anh.',
        semanticHash,
        topicCode: 'DAILY_LIFE',
        constraintsJson: { sentenceCount: 1 },
        contentSnapshotJson: {
          source: 'ai-authored-validated-v2',
          model,
          grammarCode: point.code,
          variationGroup: point.code,
          topic: item.topic,
          semanticHash,
          validation: ['SCHEMA_VALID', 'REQUIRED_FIELDS_PRESENT', 'SOURCE_UNIQUE'],
        },
        targets: {
          create: { grammarPointVersionId: point.version.id, targetRole: 'PRIMARY' },
        },
        sentences: {
          create: {
            position: 0,
            sourceTextVi: item.sourceVi,
            referenceAnswersJson: item.answers,
            semanticRequirementsJson: item.requirements,
          },
        },
      },
      select: { id: true },
    });
    const senseKey = `${point.version.cefrLevel.toLowerCase()}:${normalize(item.vocabulary.lemma).replace(/\s+/g, '-')}:generated`;
    const vocabulary = await prisma.vocabularyEntry.upsert({
      where: { senseKey },
      update: {},
      create: {
        lemma: item.vocabulary.lemma,
        partOfSpeech: item.vocabulary.partOfSpeech,
        senseKey,
        definitionVi: item.vocabulary.definitionVi,
        cefrLevel: point.version.cefrLevel as 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2',
        status: 'PUBLISHED',
      },
      select: { id: true },
    });
    for (const [hintIndex, hintTextVi] of item.vocabulary.hints.entries())
      await prisma.vocabularyHint.upsert({
        where: {
          exerciseId_position_hintLevel: {
            exerciseId: exercise.id,
            position: 0,
            hintLevel: hintIndex + 1,
          },
        },
        update: {},
        create: {
          exerciseId: exercise.id,
          vocabularyEntryId: vocabulary.id,
          surfaceForm: item.vocabulary.lemma,
          hintLevel: hintIndex + 1,
          hintTextVi,
          position: 0,
          isAnswerRevealing: false,
        },
      });
  }
}

async function main(): Promise<void> {
  localEnvironment();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is required');
  const model = process.env.OPENAI_AUTHORING_MODEL || process.env.OPENAI_MODEL || 'gpt-5-mini';
  const level = argument('--level');
  const targetPerPoint = Number(argument('--target-per-point') ?? '12');
  if (!Number.isInteger(targetPerPoint) || targetPerPoint < 2 || targetPerPoint > 20)
    throw new Error('--target-per-point must be between 2 and 20');

  const points = await prisma.grammarPoint.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: { code: 'asc' },
    select: {
      id: true,
      code: true,
      versions: {
        where: { status: 'PUBLISHED', ...(level ? { cefrLevel: level as never } : {}) },
        orderBy: { versionNo: 'desc' },
        take: 1,
        select: {
          id: true,
          cefrLevel: true,
          title: true,
          shortDescription: true,
          formSummary: true,
          meaningSummary: true,
          usageNotes: true,
          rules: { orderBy: { priority: 'asc' }, select: { description: true } },
          examples: {
            orderBy: { sortOrder: 'asc' },
            select: { englishText: true, vietnameseText: true },
          },
        },
      },
    },
  });

  let created = 0;
  for (const point of points) {
    const version = point.versions[0];
    if (!version) continue;
    const existing = await prisma.exercise.findMany({
      where: {
        contentStatus: 'PUBLISHED',
        targets: { some: { grammarPointVersionId: version.id, targetRole: 'PRIMARY' } },
      },
      orderBy: { contentKey: 'asc' },
      select: {
        sentences: { orderBy: { position: 'asc' }, take: 1, select: { sourceTextVi: true } },
      },
    });
    const sources = existing.flatMap((item) =>
      item.sentences.map((sentence) => sentence.sourceTextVi),
    );
    let needed = Math.max(0, targetPerPoint - sources.length);
    if (!needed) continue;
    process.stdout.write(`Generating ${needed} variants for ${point.code}... `);
    let preferredBatchSize = 6;
    while (needed > 0) {
      const batchSize = Math.min(preferredBatchSize, needed);
      let generated: GeneratedExercise[] | undefined;
      let lastError: unknown;
      for (let attempt = 1; attempt <= 3 && !generated; attempt += 1) {
        try {
          generated = await generate(
            apiKey,
            model,
            { code: point.code, version },
            batchSize,
            sources,
          );
        } catch (error: unknown) {
          lastError = error;
          if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
        }
      }
      if (!generated && preferredBatchSize > 3) {
        preferredBatchSize = 3;
        continue;
      }
      if (!generated) throw lastError;
      await persist(
        { id: point.id, code: point.code, version },
        generated,
        model,
        sources.length + 1,
      );
      sources.push(...generated.map((item) => item.sourceVi));
      created += generated.length;
      needed -= generated.length;
    }
    console.log('done');
  }
  console.log(
    `Created ${created} validated exercises; target=${targetPerPoint} per grammar point.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
