import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import { intermediateCatalog } from '../content/catalog/b1-b2.v3';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function json(value: unknown): Promise<string> {
  return prettier.format(JSON.stringify(value), {
    ...(await prettier.resolveConfig(root)),
    parser: 'json',
  });
}

function grammarBundle(item: (typeof intermediateCatalog)[number]) {
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
    usageConstraints: [
      'Choose the form from the intended time, meaning, discourse context, and register.',
    ],
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
      allowedContexts: ['daily life', 'study', 'work', 'travel', 'public services'],
      maximumSentenceWords: item.cefr === 'B1' ? 22 : 28,
      requireExplicitTarget: true,
    },
    evaluationPolicy: {
      mustCheck: [
        'target form',
        'target meaning',
        'time reference',
        'meaning preservation',
        'natural accepted alternatives',
      ],
      referenceAnswersAreNonExhaustive: true,
    },
    provenance: {
      origin: 'AI_GENERATED',
      model: 'codex-gpt-5-authoring',
      promptVersion: 'intermediate-content-v3',
      generatedAt: '2026-08-16T00:00:00Z',
      sourceNotes: [
        'Independently authored for this personal application; no proprietary curriculum text copied.',
      ],
    },
  };
}

function level(cefr: 'B1' | 'B2', title: string) {
  const points = intermediateCatalog.filter((item) => item.cefr === cefr);
  const items = (slice: typeof points) =>
    slice.map((item) => ({
      grammarPointCode: item.code,
      grammarPointVersion: 1,
      role: 'REQUIRED',
      weight: 1,
      minimumEvidenceCount: 5,
    }));
  return {
    code: `LEVEL_${cefr}_${cefr === 'B1' ? 'INTERMEDIATE' : 'UPPER_INTERMEDIATE'}`,
    cefr,
    title,
    unlockPolicy: { requiredMasteryPercent: 80, minimumPointScore: 60 },
    units: [
      {
        code: `${cefr}_U01_TIME_CONDITIONS`,
        title:
          cefr === 'B1'
            ? 'Thời gian, trải nghiệm và điều kiện'
            : 'Thời gian tương lai và điều kiện nâng cao',
        items: items(points.slice(0, 5)),
      },
      {
        code: `${cefr}_U02_VOICE_CLAUSES_MODALITY`,
        title:
          cefr === 'B1' ? 'Modal, bị động và mệnh đề' : 'Bị động, tường thuật và sắc thái nghĩa',
        items: items(points.slice(5)),
      },
    ],
  };
}

async function main(): Promise<void> {
  for (const item of intermediateCatalog) {
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
  const previous = JSON.parse(
    await readFile(join(root, 'content', 'curriculum', 'personal-english.v2.json'), 'utf8'),
  ) as { levels: unknown[] };
  const release = {
    ...previous,
    version: 3,
    levels: [...previous.levels, level('B1', 'Trung cấp B1'), level('B2', 'Trung cao cấp B2')],
  };
  await writeFile(
    join(root, 'content', 'curriculum', 'personal-english.v3.json'),
    await json(release),
    'utf8',
  );
  console.log(`Authored ${intermediateCatalog.length} grammar bundles and curriculum release v3.`);
}

void main();
