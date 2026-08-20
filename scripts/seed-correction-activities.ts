import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const versions = await prisma.grammarPointVersion.findMany({
    where: { status: 'PUBLISHED', errorPatterns: { some: {} } },
    select: {
      id: true,
      cefrLevel: true,
      grammarPoint: { select: { code: true } },
      errorPatterns: {
        orderBy: { errorCode: 'asc' },
        take: 2,
        select: {
          errorCode: true,
          incorrectPattern: true,
          correctedPattern: true,
          explanationVi: true,
        },
      },
    },
  });
  let created = 0;
  for (const version of versions) {
    for (const [index, pattern] of version.errorPatterns.entries()) {
      if (pattern.incorrectPattern.trim() === pattern.correctedPattern.trim()) continue;
      const contentKey = `${version.cefrLevel}_${version.grammarPoint.code}_CORRECT_${index + 1}`;
      const exists = await prisma.exercise.findUnique({
        where: { contentKey },
        select: { id: true },
      });
      if (exists) continue;
      await prisma.exercise.create({
        data: {
          contentKey,
          origin: 'GRAMMAR_KB_DERIVED',
          type: 'CORRECT_ERROR',
          contentStatus: 'PUBLISHED',
          generatorVersion: 'reviewed-error-pattern-v1',
          evaluatorRubricVersion: 'layered-activity-v1',
          locale: 'vi',
          difficulty: 1,
          promptContextVi: pattern.explanationVi,
          instructionVi: 'Tìm và sửa lỗi ngữ pháp. Nhập lại toàn bộ câu đúng.',
          semanticHash: createHash('sha256')
            .update(`correct:${pattern.correctedPattern.toLowerCase()}`)
            .digest('hex'),
          topicCode: 'STUDY',
          constraintsJson: {
            schemaVersion: '1.0',
            promptPayload: {
              incorrectSentence: pattern.incorrectPattern,
              errorCode: pattern.errorCode,
            },
          },
          contentSnapshotJson: {
            source: 'reviewed-grammar-kb-error-pattern-v1',
            grammarCode: version.grammarPoint.code,
            errorCode: pattern.errorCode,
            validation: ['REVIEWED_KB_PAIR', 'SOURCE_DIFFERS_FROM_CORRECTION'],
          },
          targets: {
            create: { grammarPointVersionId: version.id, targetRole: 'PRIMARY' },
          },
          sentences: {
            create: {
              position: 0,
              sourceTextVi: 'Câu dưới đây có một lỗi ngữ pháp cần sửa.',
              referenceAnswersJson: [pattern.correctedPattern],
              semanticRequirementsJson: [
                `Correct the ${pattern.errorCode} error`,
                'Preserve the intended meaning of the original sentence',
              ],
            },
          },
        },
      });
      created += 1;
    }
  }
  console.log(`Created ${created} correction activities from reviewed Grammar KB patterns.`);
}

void main().finally(() => prisma.$disconnect());
