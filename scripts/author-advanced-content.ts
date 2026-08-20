import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { advancedCatalog } from '../content/catalog/c1-c2.v4';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function grammarBundle(item: (typeof advancedCatalog)[number]) {
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
      'The structure must be motivated by meaning, information flow, stance, or register rather than complexity alone.',
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
      allowedContexts: [
        'academic discussion',
        'professional writing',
        'formal correspondence',
        'narrative',
        'public policy',
      ],
      maximumSentenceWords: item.cefr === 'C1' ? 34 : 42,
      requireExplicitTarget: true,
      requireDiscourseMotivation: true,
    },
    evaluationPolicy: {
      mustCheck: [
        'target form',
        'target meaning',
        'scope',
        'information structure',
        'register',
        'meaning preservation',
        'natural accepted alternatives',
      ],
      referenceAnswersAreNonExhaustive: true,
    },
    provenance: {
      origin: 'AI_GENERATED',
      model: 'codex-gpt-5-authoring',
      promptVersion: 'advanced-content-v4',
      generatedAt: '2026-08-16T00:00:00Z',
      sourceNotes: [
        'Independently authored for this personal application; no proprietary curriculum text copied.',
      ],
    },
  };
}

function level(cefr: 'C1' | 'C2', title: string) {
  const points = advancedCatalog.filter((item) => item.cefr === cefr);
  const items = (slice: typeof points) =>
    slice.map((item) => ({
      grammarPointCode: item.code,
      grammarPointVersion: 1,
      role: 'REQUIRED',
      weight: 1,
      minimumEvidenceCount: 5,
    }));
  const midpoint = Math.ceil(points.length / 2);
  return {
    code: `LEVEL_${cefr}_${cefr === 'C1' ? 'ADVANCED' : 'PROFICIENT'}`,
    cefr,
    title,
    unlockPolicy: { requiredMasteryPercent: 80, minimumPointScore: 60 },
    units: [
      {
        code: `${cefr}_U01_STRUCTURE_AND_STANCE`,
        title:
          cefr === 'C1'
            ? 'Cấu trúc, trọng tâm và lập trường'
            : 'Cấu trúc phản thực và tổ chức thông tin',
        items: items(points.slice(0, midpoint)),
      },
      {
        code: `${cefr}_U02_DISCOURSE_AND_REGISTER`,
        title:
          cefr === 'C1' ? 'Liên kết, tường thuật và văn phong' : 'Diễn ngôn, hàm ý và register',
        items: items(points.slice(midpoint)),
      },
    ],
  };
}

async function main(): Promise<void> {
  for (const item of advancedCatalog) {
    const path = join(
      root,
      'content',
      'grammar',
      item.cefr.toLowerCase(),
      `${item.code.toLowerCase().replaceAll('_', '-')}.v1.json`,
    );
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(grammarBundle(item), null, 2)}\n`, 'utf8');
  }
  const previous = JSON.parse(
    await readFile(join(root, 'content', 'curriculum', 'personal-english.v3.json'), 'utf8'),
  ) as { levels: unknown[] };
  const release = {
    ...previous,
    version: 4,
    levels: [...previous.levels, level('C1', 'Cao cấp C1'), level('C2', 'Thành thạo C2')],
  };
  await writeFile(
    join(root, 'content', 'curriculum', 'personal-english.v4.json'),
    `${JSON.stringify(release, null, 2)}\n`,
    'utf8',
  );
  console.log(`Authored ${advancedCatalog.length} grammar bundles and curriculum release v4.`);
}

void main();
