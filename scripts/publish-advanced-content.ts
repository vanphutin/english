import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  GrammarKnowledgeBaseService,
  PrismaGrammarKnowledgeBaseRepository,
} from '@english/grammar-kb';
import { CurriculumService, PrismaCurriculumRepository } from '@english/curriculum';
import { advancedCatalog } from '../content/catalog/c1-c2.v4';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const grammar = new GrammarKnowledgeBaseService(new PrismaGrammarKnowledgeBaseRepository(prisma));
  const curriculum = new CurriculumService(new PrismaCurriculumRepository(prisma));
  for (const item of advancedCatalog) {
    const existing = await prisma.grammarPointVersion.findFirst({
      where: { grammarPoint: { code: item.code }, versionNo: 1, locale: 'vi' },
      select: { status: true },
    });
    if (!existing) {
      const path = join(
        'content',
        'grammar',
        item.cefr.toLowerCase(),
        `${item.code.toLowerCase().replaceAll('_', '-')}.v1.json`,
      );
      await grammar.importDraft(JSON.parse(await readFile(path, 'utf8')) as unknown);
    }
    const current = await prisma.grammarPointVersion.findFirstOrThrow({
      where: { grammarPoint: { code: item.code }, versionNo: 1, locale: 'vi' },
      select: { status: true },
    });
    if (current.status !== 'PUBLISHED') await grammar.publish(item.code, 1);
  }
  const existingRelease = await prisma.curriculumRelease.findFirst({
    where: { curriculum: { code: 'PERSONAL_ENGLISH' }, versionNo: 4 },
    select: { status: true },
  });
  if (!existingRelease)
    await curriculum.importDraft(
      JSON.parse(
        await readFile(join('content', 'curriculum', 'personal-english.v4.json'), 'utf8'),
      ) as unknown,
    );
  const release = await prisma.curriculumRelease.findFirstOrThrow({
    where: { curriculum: { code: 'PERSONAL_ENGLISH' }, versionNo: 4 },
    select: { status: true },
  });
  if (release.status !== 'PUBLISHED') await curriculum.publish('PERSONAL_ENGLISH', 4);
  console.log(`Published ${advancedCatalog.length} authored points and curriculum v4.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
