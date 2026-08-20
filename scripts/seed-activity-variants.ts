import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const activityDefinitions: ReadonlyArray<{
  type: string;
  suffix: string;
  instructionVi: string;
  payload: (input: {
    answer: string;
    requirements: string[];
    distractors: string[];
  }) => Prisma.InputJsonObject;
}> = [
  {
    type: 'COMPLETE_SENTENCE',
    suffix: 'COMPLETE',
    instructionVi: 'Hoàn thành câu tiếng Anh theo ý nghĩa và ngữ pháp mục tiêu.',
    payload: ({ answer }) => ({
      starter: answer.split(/\s+/).slice(0, 2).join(' '),
    }),
  },
  {
    type: 'ORDER_WORDS',
    suffix: 'ORDER',
    instructionVi: 'Sắp xếp các từ thành một câu tiếng Anh tự nhiên.',
    payload: ({ answer }) => ({
      wordBank: answer
        .replace(/[.!?]$/u, '')
        .split(/\s+/)
        .reverse(),
    }),
  },
  {
    type: 'MINI_DIALOGUE',
    suffix: 'DIALOGUE',
    instructionVi: 'Viết câu đáp phù hợp để hoàn thành đoạn hội thoại ngắn.',
    payload: () => ({
      speakerLabel: 'Bạn',
      partnerLabel: 'Người đối thoại',
    }),
  },
  {
    type: 'SELECT_IN_CONTEXT',
    suffix: 'SELECT',
    instructionVi: 'Chọn câu tiếng Anh phù hợp nhất với ngữ cảnh rồi nhập lại câu hoàn chỉnh.',
    payload: ({ answer, distractors }) => ({
      choices: [answer, ...distractors].slice(0, 3),
    }),
  },
  {
    type: 'GUIDED_WRITING',
    suffix: 'GUIDED',
    instructionVi: 'Viết một câu tiếng Anh đáp ứng đầy đủ các yêu cầu cho trước.',
    payload: ({ requirements }) => ({
      requiredElements: requirements.slice(0, 4),
    }),
  },
];

async function main(): Promise<void> {
  const bases = await prisma.exercise.findMany({
    where: { type: 'TRANSLATE_CONTEXT', contentStatus: 'PUBLISHED' },
    include: { targets: true, sentences: true, vocabularyHints: true },
    orderBy: { contentKey: 'asc' },
  });
  const answerPool = bases.flatMap((base) => {
    const references = base.sentences[0]?.referenceAnswersJson as string[] | undefined;
    return references?.[0] ? [references[0]] : [];
  });
  let created = 0;
  for (const base of bases) {
    const sentence = base.sentences[0];
    const answers = sentence?.referenceAnswersJson as string[] | undefined;
    const answer = answers?.[0];
    if (!sentence || !answer) continue;
    const requirements = sentence.semanticRequirementsJson as string[];
    const distractors = answerPool.filter((candidate) => candidate !== answer).slice(0, 2);
    for (const definition of activityDefinitions) {
      const contentKey = `${base.contentKey}_${definition.suffix}`;
      const exists = await prisma.exercise.findUnique({
        where: { contentKey },
        select: { id: true },
      });
      if (exists) continue;
      await prisma.exercise.create({
        data: {
          contentKey,
          origin: 'DERIVED_VALIDATED',
          type: definition.type,
          contentStatus: 'PUBLISHED',
          generatorVersion: 'activity-variant-v1',
          evaluatorRubricVersion: base.evaluatorRubricVersion,
          locale: base.locale,
          difficulty: base.difficulty,
          promptContextVi: base.promptContextVi,
          instructionVi: definition.instructionVi,
          semanticHash: base.semanticHash,
          topicCode: base.topicCode,
          constraintsJson: {
            schemaVersion: '1.0',
            promptPayload: definition.payload({ answer, requirements, distractors }),
          } satisfies Prisma.InputJsonValue,
          contentSnapshotJson: {
            source: 'derived-activity-variant-v1',
            baseExerciseId: base.id,
            baseContentKey: base.contentKey,
            activityType: definition.type,
          },
          targets: {
            create: base.targets.map((target) => ({
              grammarPointVersionId: target.grammarPointVersionId,
              targetRole: target.targetRole,
              weight: target.weight,
            })),
          },
          sentences: {
            create: base.sentences.map((item) => ({
              position: item.position,
              sourceTextVi: item.sourceTextVi,
              referenceAnswersJson: item.referenceAnswersJson as Prisma.InputJsonValue,
              semanticRequirementsJson: item.semanticRequirementsJson as Prisma.InputJsonValue,
            })),
          },
          vocabularyHints: {
            create: base.vocabularyHints.map((hint) => ({
              vocabularyEntryId: hint.vocabularyEntryId,
              surfaceForm: hint.surfaceForm,
              hintLevel: hint.hintLevel,
              hintTextVi: hint.hintTextVi,
              position: hint.position,
              isAnswerRevealing: hint.isAnswerRevealing,
            })),
          },
        },
      });
      created += 1;
    }
  }
  console.log(
    `Created ${created} validated activity variants from ${bases.length} base exercises.`,
  );
}

void main().finally(() => prisma.$disconnect());
