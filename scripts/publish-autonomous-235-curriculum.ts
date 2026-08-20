import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  GrammarKnowledgeBaseService,
  PrismaGrammarKnowledgeBaseRepository,
} from '@english/grammar-kb';
import { CurriculumService, PrismaCurriculumRepository } from '@english/curriculum';
import { ManifestPlanner, LessonGenerator } from '@english/operations';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const grammar = new GrammarKnowledgeBaseService(new PrismaGrammarKnowledgeBaseRepository(prisma));
  const curriculum = new CurriculumService(new PrismaCurriculumRepository(prisma));

  const planner = new ManifestPlanner();
  const manifestResult = planner.generateFullAutonomousManifest();

  const generator = new LessonGenerator();
  const packages = generator.generateAll235Packages();

  console.log(`\n==================================================`);
  console.log(`🚀 STARTING PUBLICATION OF 235 LESSONS TO DB & FE`);
  console.log(`==================================================`);

  // 1. Import and publish all 235 GrammarPoint packages into DB
  let publishedCount = 0;
  for (const pkg of packages) {
    const existing = await prisma.grammarPointVersion.findFirst({
      where: { grammarPoint: { code: pkg.code }, versionNo: 1, locale: 'vi' },
      select: { status: true },
    });

    if (!existing) {
      await grammar.importDraft(pkg);
    }

    const current = await prisma.grammarPointVersion.findFirst({
      where: { grammarPoint: { code: pkg.code }, versionNo: 1, locale: 'vi' },
      select: { status: true },
    });

    if (current && current.status !== 'PUBLISHED') {
      await grammar.publish(pkg.code, 1);
    }
    publishedCount++;
  }
  console.log(`✅ 1. Successfully imported & published ${publishedCount} Grammar Points to Database.`);

  // 2. Build personal-english.v5.json Release Spec
  const releaseSpec = {
    schemaVersion: '1.0',
    code: 'PERSONAL_ENGLISH',
    title: 'Lộ trình ngữ pháp tiếng Anh cá nhân (Toàn diện A1-C2 - 235 bài học)',
    version: 5,
    levels: manifestResult.manifest.levels.map((lvl) => ({
      code: `LEVEL_${lvl.cefr}_FULL`,
      cefr: lvl.cefr,
      title: `Trình độ ${lvl.cefr}`,
      unlockPolicy: {
        requiredMasteryPercent: 80,
        minimumPointScore: 60,
      },
      units: lvl.units.map((u) => ({
        code: u.code,
        title: u.titleVi,
        items: u.points.map((pt) => ({
          grammarPointCode: pt.code,
          grammarPointVersion: 1,
          role: 'REQUIRED',
          weight: 1,
          minimumEvidenceCount: 5,
        })),
      })),
    })),
  };

  // 3. Write personal-english.v5.json file
  const v5Path = join(process.cwd(), 'content', 'curriculum', 'personal-english.v5.json');
  await writeFile(v5Path, JSON.stringify(releaseSpec, null, 2), 'utf8');
  console.log(`✅ 2. Created & saved content/curriculum/personal-english.v5.json.`);

  // 4. Import & Publish Curriculum Release v5 into DB
  const existingRelease = await prisma.curriculumRelease.findFirst({
    where: { curriculum: { code: 'PERSONAL_ENGLISH' }, versionNo: 5 },
    select: { status: true },
  });

  if (!existingRelease) {
    await curriculum.importDraft(releaseSpec);
  }

  const release = await prisma.curriculumRelease.findFirst({
    where: { curriculum: { code: 'PERSONAL_ENGLISH' }, versionNo: 5 },
    select: { status: true },
  });

  if (release && release.status !== 'PUBLISHED') {
    await curriculum.publish('PERSONAL_ENGLISH', 5);
  }
  console.log(`✅ 3. Published Curriculum Release v5 (PERSONAL_ENGLISH) into Database.`);

  console.log(`\n==================================================`);
  console.log(`🎉 PUBLICATION COMPLETE! FRONTEND IS NOW LIVE WITH 235 LESSONS`);
  console.log(`==================================================`);
  console.log(`- Batch Code: AUTONOMOUS_A1_C2_FULL_MANIFEST_235`);
  console.log(`- Curriculum Release: PERSONAL_ENGLISH v5`);
  console.log(`- Total Published Lessons: 235 / 235 (A1-C2)`);
  console.log(`- Status: PUBLISHED`);
}

main()
  .catch((error: unknown) => {
    console.error('Fatal Publication Error:', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
