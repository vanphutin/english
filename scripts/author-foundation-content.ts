import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import { foundationCatalog } from '../content/catalog/a1-a2.v2';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const generatedAt = '2026-08-16T00:00:00Z';

async function json(value: unknown): Promise<string> {
  return prettier.format(JSON.stringify(value), {
    ...(await prettier.resolveConfig(root)),
    parser: 'json',
  });
}

function grammarBundle(item: (typeof foundationCatalog)[number]) {
  return {
    schemaVersion: '1.0',
    code: item.code,
    family: item.family,
    version: 1,
    cefr: item.cefr,
    status: 'DRAFT',
    title: item.title,
    learningObjectiveVi: item.objectiveVi,
    learningObjectiveEn: item.objectiveEn,
    form: { patterns: item.patterns, morphologyNotes: [item.rule] },
    meaning: { uses: item.uses },
    usageConstraints: ['Choose the form from the intended meaning and sentence context.'],
    relationships: {
      prerequisites: item.prerequisites,
      buildsOn: item.prerequisites,
      contrastsWith: [],
      oftenConfusedWith: [],
    },
    rules: [{ code: `${item.code}_CORE`, type: 'HARD_CONSTRAINT', description: item.rule }],
    examples: item.examples.map(([type, english, vietnamese]) => ({
      type,
      english,
      vietnamese,
      explanationVi: `Ví dụ minh họa đúng mục tiêu ${item.title.toLocaleLowerCase('vi')}.`,
    })),
    commonErrors: [
      {
        code: `${item.code}_COMMON_ERROR`,
        incorrect: item.error[0],
        corrected: item.error[1],
        explanationVi: item.error[2],
        severity: 'MAJOR',
      },
    ],
    generationPolicy: {
      locale: 'vi',
      allowedContexts: ['daily life', 'study', 'work', 'travel'],
      maximumSentenceWords: item.cefr === 'A1' ? 12 : 16,
      requireExplicitTarget: true,
    },
    evaluationPolicy: {
      mustCheck: ['target form', 'meaning preservation', 'natural accepted alternatives'],
      referenceAnswersAreNonExhaustive: true,
    },
    provenance: {
      origin: 'AI_GENERATED',
      model: 'codex-gpt-5-authoring',
      promptVersion: 'foundation-content-v2',
      generatedAt,
      sourceNotes: [
        'Independently authored for this personal application; no proprietary curriculum text copied.',
      ],
    },
  };
}

const existingA1 = [
  'SUBJECT_PRONOUNS',
  'BE_PRESENT_AFFIRMATIVE',
  'BE_PRESENT_NEGATIVE',
  'BE_PRESENT_QUESTIONS',
  'POSSESSIVE_ADJECTIVES_BASIC',
];

function curriculumRelease() {
  const itemsFor = (codes: string[]) =>
    codes.map((grammarPointCode) => ({
      grammarPointCode,
      grammarPointVersion: 1,
      role: 'REQUIRED',
      weight: 1,
      minimumEvidenceCount: 5,
    }));
  const a1 = [
    ...existingA1,
    ...foundationCatalog.filter((item) => item.cefr === 'A1').map((item) => item.code),
  ];
  const a2 = foundationCatalog.filter((item) => item.cefr === 'A2').map((item) => item.code);
  return {
    schemaVersion: '1.0',
    code: 'PERSONAL_ENGLISH',
    title: 'Lộ trình ngữ pháp tiếng Anh cá nhân',
    version: 2,
    levels: [
      {
        code: 'LEVEL_A1_FOUNDATIONS',
        cefr: 'A1',
        title: 'Nền tảng A1',
        unlockPolicy: { requiredMasteryPercent: 80, minimumPointScore: 60 },
        units: [
          {
            code: 'A1_U01_SUBJECT_AND_BE',
            title: 'Chủ ngữ, động từ be và sở hữu',
            items: itemsFor(a1.slice(0, 5)),
          },
          {
            code: 'A1_U02_EXISTENCE_AND_ROUTINES',
            title: 'Sự tồn tại và thói quen hằng ngày',
            items: itemsFor(a1.slice(5)),
          },
        ],
      },
      {
        code: 'LEVEL_A2_ELEMENTARY',
        cefr: 'A2',
        title: 'Sơ cấp A2',
        unlockPolicy: { requiredMasteryPercent: 80, minimumPointScore: 60 },
        units: [
          {
            code: 'A2_U01_TIME_AND_ACTION',
            title: 'Hành động trong quá khứ và hiện tại',
            items: itemsFor(a2.slice(0, 6)),
          },
          {
            code: 'A2_U02_QUANTITY_COMPARISON_PLANS',
            title: 'Số lượng, so sánh và dự định',
            items: itemsFor(a2.slice(6)),
          },
        ],
      },
    ],
  };
}

async function main(): Promise<void> {
  for (const item of foundationCatalog) {
    const path = join(
      root,
      'content',
      'grammar',
      item.cefr.toLowerCase(),
      `${item.code.toLowerCase().replaceAll('_', '-')}.v1.json`,
    );
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, await json(grammarBundle(item)), 'utf8');
  }
  const curriculumPath = join(root, 'content', 'curriculum', 'personal-english.v2.json');
  await writeFile(curriculumPath, await json(curriculumRelease()), 'utf8');
  console.log(`Authored ${foundationCatalog.length} grammar bundles and curriculum release v2.`);
}

void main();
