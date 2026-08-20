import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { foundationCatalog } from '../content/catalog/a1-a2.v2';
import { intermediateCatalog } from '../content/catalog/b1-b2.v3';
import { advancedCatalog } from '../content/catalog/c1-c2.v4';

const prisma = new PrismaClient();

const bootstrapExercises = [
  {
    contentKey: 'A1_SUBJECT_PRONOUNS_001',
    grammarCode: 'SUBJECT_PRONOUNS',
    contextVi: 'Bạn giới thiệu người bạn thân của mình.',
    sourceVi: 'Cô ấy là bạn thân của tôi.',
    answers: ['She is my best friend.'],
    requirements: ['Use the subject pronoun "she".'],
    vocabulary: {
      lemma: 'friend',
      partOfSpeech: 'noun',
      definitionVi: 'người bạn',
      hints: [
        'Một người có mối quan hệ thân thiết với bạn.',
        'friend — danh từ chỉ người bạn.',
        'best friend — người bạn thân nhất.',
      ],
    },
  },
  {
    contentKey: 'A1_BE_PRESENT_AFFIRMATIVE_001',
    grammarCode: 'BE_PRESENT_AFFIRMATIVE',
    contextVi: 'Bạn nói về công việc của mình.',
    sourceVi: 'Tôi là một nhà thiết kế.',
    answers: ['I am a designer.', "I'm a designer."],
    requirements: ['Use the present affirmative form of "be" with "I".'],
    vocabulary: {
      lemma: 'designer',
      partOfSpeech: 'noun',
      definitionVi: 'nhà thiết kế',
      hints: [
        'Một nghề tạo ra kiểu dáng hoặc trải nghiệm.',
        'designer — danh từ chỉ nghề nghiệp.',
        'a designer — một nhà thiết kế.',
      ],
    },
  },
  {
    contentKey: 'A1_BE_PRESENT_NEGATIVE_001',
    grammarCode: 'BE_PRESENT_NEGATIVE',
    contextVi: 'Bạn đính chính một thông tin về hôm nay.',
    sourceVi: 'Hôm nay tôi không bận.',
    answers: ['I am not busy today.', "I'm not busy today."],
    requirements: ['Use the present negative form of "be".'],
    vocabulary: {
      lemma: 'busy',
      partOfSpeech: 'adjective',
      definitionVi: 'bận rộn',
      hints: [
        'Trạng thái có nhiều việc cần làm.',
        'busy — tính từ mang nghĩa bận.',
        'today — hôm nay.',
      ],
    },
  },
  {
    contentKey: 'A1_BE_PRESENT_QUESTIONS_001',
    grammarCode: 'BE_PRESENT_QUESTIONS',
    contextVi: 'Bạn hỏi một người mới quen về quốc tịch.',
    sourceVi: 'Bạn có phải là người Việt Nam không?',
    answers: ['Are you Vietnamese?'],
    requirements: ['Use a yes/no question with present "be".'],
    vocabulary: {
      lemma: 'Vietnamese',
      partOfSpeech: 'adjective',
      definitionVi: 'thuộc Việt Nam/người Việt Nam',
      hints: [
        'Từ chỉ quốc tịch trong ngữ cảnh này.',
        'Vietnamese — tính từ chỉ quốc tịch.',
        'Viết hoa tên quốc tịch: Vietnamese.',
      ],
    },
  },
  {
    contentKey: 'A1_POSSESSIVE_ADJECTIVES_BASIC_001',
    grammarCode: 'POSSESSIVE_ADJECTIVES_BASIC',
    contextVi: 'Bạn chỉ vào chiếc máy tính của mình.',
    sourceVi: 'Đây là máy tính của tôi.',
    answers: ['This is my computer.'],
    requirements: ['Use the possessive adjective "my".'],
    vocabulary: {
      lemma: 'computer',
      partOfSpeech: 'noun',
      definitionVi: 'máy tính',
      hints: [
        'Một thiết bị điện tử dùng để làm việc.',
        'computer — danh từ chỉ máy tính.',
        'this — từ dùng để chỉ vật ở gần.',
      ],
    },
  },
] as const;

const authoredExercises = [...foundationCatalog, ...intermediateCatalog, ...advancedCatalog].map(
  (item) => ({
    cefr: item.cefr,
    contentKey: `${item.cefr}_${item.code}_001`,
    grammarCode: item.code,
    contextVi: item.exercise.contextVi,
    sourceVi: item.exercise.sourceVi,
    answers: item.exercise.answers,
    requirements: item.exercise.requirements,
    vocabulary: {
      lemma: item.exercise.vocabulary[0],
      partOfSpeech: item.exercise.vocabulary[1],
      definitionVi: item.exercise.vocabulary[2],
      hints: [
        item.exercise.vocabulary[3],
        `${item.exercise.vocabulary[0]} — ${item.exercise.vocabulary[2]}.`,
        item.exercise.vocabulary[4],
      ],
    },
  }),
);

const exercises = [
  ...bootstrapExercises.map((item) => ({ ...item, cefr: 'A1' as const })),
  ...authoredExercises,
];

async function main(): Promise<void> {
  for (const item of exercises) {
    const semanticHash = createHash('sha256')
      .update(item.sourceVi.trim().toLowerCase())
      .digest('hex');
    const grammarVersion = await prisma.grammarPointVersion.findFirst({
      where: { grammarPoint: { code: item.grammarCode }, status: 'PUBLISHED' },
      orderBy: { versionNo: 'desc' },
      select: { id: true },
    });
    if (!grammarVersion) throw new Error(`Published grammar point missing: ${item.grammarCode}`);

    const exercise = await prisma.exercise.upsert({
      where: { contentKey: item.contentKey },
      update: {
        contentStatus: 'PUBLISHED',
        promptContextVi: item.contextVi,
        instructionVi: 'Dịch câu tiếng Việt sang tiếng Anh.',
        semanticHash,
        topicCode: 'DAILY_LIFE',
        contentSnapshotJson: { source: 'curated-seed-v1', grammarCode: item.grammarCode },
        targets: {
          deleteMany: {},
          create: { grammarPointVersionId: grammarVersion.id, targetRole: 'PRIMARY' },
        },
        sentences: {
          deleteMany: {},
          create: {
            position: 0,
            sourceTextVi: item.sourceVi,
            referenceAnswersJson: [...item.answers],
            semanticRequirementsJson: [...item.requirements],
          },
        },
      },
      create: {
        contentKey: item.contentKey,
        origin: 'CURATED',
        type: 'TRANSLATE_CONTEXT',
        contentStatus: 'PUBLISHED',
        generatorVersion: 'curated-v1',
        evaluatorRubricVersion: 'deterministic-v1',
        locale: 'vi',
        difficulty: 1,
        promptContextVi: item.contextVi,
        instructionVi: 'Dịch câu tiếng Việt sang tiếng Anh.',
        semanticHash,
        topicCode: 'DAILY_LIFE',
        constraintsJson: { sentenceCount: 1 },
        contentSnapshotJson: { source: 'curated-seed-v1', grammarCode: item.grammarCode },
        targets: {
          create: { grammarPointVersionId: grammarVersion.id, targetRole: 'PRIMARY' },
        },
        sentences: {
          create: {
            position: 0,
            sourceTextVi: item.sourceVi,
            referenceAnswersJson: [...item.answers],
            semanticRequirementsJson: [...item.requirements],
          },
        },
      },
      select: { id: true },
    });
    const entry = await prisma.vocabularyEntry.upsert({
      where: { senseKey: `${item.cefr.toLowerCase()}:${item.vocabulary.lemma}:1` },
      update: {
        definitionVi: item.vocabulary.definitionVi,
        status: 'PUBLISHED',
      },
      create: {
        lemma: item.vocabulary.lemma,
        partOfSpeech: item.vocabulary.partOfSpeech,
        senseKey: `${item.cefr.toLowerCase()}:${item.vocabulary.lemma}:1`,
        definitionVi: item.vocabulary.definitionVi,
        cefrLevel: item.cefr,
        status: 'PUBLISHED',
      },
      select: { id: true },
    });
    for (const [index, hintTextVi] of item.vocabulary.hints.entries()) {
      const hintLevel = index + 1;
      await prisma.vocabularyHint.upsert({
        where: {
          exerciseId_position_hintLevel: { exerciseId: exercise.id, position: 0, hintLevel },
        },
        update: { hintTextVi, isAnswerRevealing: false },
        create: {
          exerciseId: exercise.id,
          vocabularyEntryId: entry.id,
          surfaceForm: item.vocabulary.lemma,
          hintLevel,
          hintTextVi,
          position: 0,
          isAnswerRevealing: false,
        },
      });
    }
  }
  console.log(`Seeded ${exercises.length} published exercises.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
