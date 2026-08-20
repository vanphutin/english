import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// These v2 patterns were editorially checked to preserve actors, propositions, polarity, and time.
// Expanding this list requires the same independent preflight plus a human-readable sample review.
const approvedGrammarCodes = [
  'BE_PRESENT_AFFIRMATIVE',
  'FUTURE_GOING_TO_PLANS',
  'CLEFT_SENTENCES_FOCUS',
  'FRONTING_TOPICALISATION',
  'CONDITIONAL_INVERSION_WITHOUT_IF',
];

async function main(): Promise<void> {
  const result = await prisma.exercise.updateMany({
    where: {
      type: 'TRANSFORM_SENTENCE',
      contentStatus: 'PUBLISHED',
      targets: {
        none: { grammarPointVersion: { grammarPoint: { code: { in: approvedGrammarCodes } } } },
      },
    },
    data: { contentStatus: 'RETIRED' },
  });
  const published = await prisma.exercise.count({
    where: { type: 'TRANSFORM_SENTENCE', contentStatus: 'PUBLISHED' },
  });
  console.log(`Retired ${result.count} unapproved transformations; ${published} remain published.`);
}

void main().finally(() => prisma.$disconnect());
