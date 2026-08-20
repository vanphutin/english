import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ContentFactoryValidator,
  PUBLISHED_STABLE_CODES,
  type GrammarBundle,
} from '@english/contracts';
import {
  ManifestPlanner,
  OpenAiCompatibleClient,
  type CurriculumPointSpec,
} from '@english/operations';

type Cefr = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
type Target = CurriculumPointSpec & { cefr: Cefr };
type ChatPayload = { choices?: Array<{ message?: { content?: string } }> };
type ResponsesPayload = {
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
};

const root = process.cwd();
const validator = new ContentFactoryValidator();

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function targets(): Target[] {
  const manifest = new ManifestPlanner().generateFullAutonomousManifest().manifest;
  return manifest.levels.flatMap((level) =>
    level.units.flatMap(
      (unit) => level.cefr && unit.points.map((point) => ({ ...point, cefr: level.cefr })),
    ),
  );
}

function extractJson(payload: unknown): unknown {
  const responses = payload as ResponsesPayload;
  const content =
    (payload as ChatPayload).choices?.[0]?.message?.content ??
    responses.output_text ??
    responses.output?.flatMap((item) => item.content ?? []).find((item) => item.text)?.text;
  if (!content) throw new Error('Provider returned no message content');
  const cleaned = content.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

function prompt(batch: Target[]): string {
  return `Bạn là chuyên gia biên soạn ngữ pháp tiếng Anh cho người Việt. Viết nội dung GỐC, chính xác,
không sao chép giáo trình. Trả về đúng JSON object {"bundles": [...]} và không thêm văn bản khác.

Mỗi bundle phải theo cấu trúc:
{
 "schemaVersion":"1.0", "code":string, "family":string, "version":2, "cefr":string,
 "status":"DRAFT", "title":string,
 "learningObjectiveVi":string, "learningObjectiveEn":string,
 "form":{"patterns":[ít nhất 2 mẫu cụ thể],"morphologyNotes":[ít nhất 1 ghi chú]},
 "meaning":{"uses":[ít nhất 2 cách dùng cụ thể]},
 "usageConstraints":[ít nhất 2 ranh giới dùng/không dùng],
 "relationships":{"prerequisites":string[],"buildsOn":string[],"contrastsWith":string[],"oftenConfusedWith":string[]},
 "rules":[ít nhất 2 phần tử {"code":string,"type":"HARD_CONSTRAINT"|"TENDENCY"|"FORM"|"MEANING"|"USE","description":string}],
 "examples":[ít nhất 5 phần tử {"type":"AFFIRMATIVE"|"NEGATIVE"|"QUESTION"|"CONTEXTUAL"|"CONTRASTIVE","english":string,"vietnamese":string,"explanationVi":string}; bắt buộc có AFFIRMATIVE, NEGATIVE, QUESTION],
 "commonErrors":[ít nhất 2 phần tử {"code":string,"incorrect":string,"corrected":string,"explanationVi":string,"severity":"MINOR"|"MAJOR"|"BLOCKING"}],
 "generationPolicy":{"allowedContexts":[string],"maximumSentenceWords":number,"requireExplicitTarget":true},
 "evaluationPolicy":{"mustCheck":[string],"referenceAnswersAreNonExhaustive":true},
 "provenance":{"origin":"AI_GENERATED","model":"secondary-authoring","promptVersion":"cf4-author-v2","generatedAt":"2026-08-18T00:00:00.000Z","sourceNotes":["Independently authored for this personal application."]},
 "license":"PUBLIC_CONTENT"
}

Không dùng câu placeholder như “illustrative sentence”, “correct usage”, “pattern for”. Ví dụ phải tự nhiên,
thể hiện đúng chủ điểm; giải thích tiếng Việt phải chỉ ra form/meaning/use. Giữ nguyên code, family, cefr và
relationships đã cung cấp. Nội dung ở A1/A2 ngắn, dễ hiểu; B1/B2 có ngữ cảnh; C1/C2 làm rõ register,
scope và sắc thái. Các chủ điểm cần viết:
${JSON.stringify(batch, null, 2)}`;
}

async function main(): Promise<void> {
  const args = new Map(
    process.argv.slice(2).map((arg) => {
      const [key, value = 'true'] = arg.replace(/^--/, '').split('=', 2);
      return [key, value];
    }),
  );
  const level = args.get('level') as Cefr | undefined;
  const limit = Number(args.get('limit') ?? '0');
  const batchSize = Math.min(5, Math.max(1, Number(args.get('batch-size') ?? '3')));
  const resume = args.get('resume') !== 'false';
  const provider = args.get('provider') ?? 'secondary';
  const useOpenAi = provider === 'openai';

  const client = new OpenAiCompatibleClient({
    name: useOpenAi ? 'OPENAI' : 'SECONDARY_OPENAI_COMPATIBLE',
    baseUrl: useOpenAi ? 'https://api.openai.com/v1' : env('SECONDARY_AI_BASE_URL'),
    apiKey: env(useOpenAi ? 'OPENAI_API_KEY' : 'SECONDARY_AI_API_KEY'),
    allowedHosts: [useOpenAi ? 'api.openai.com' : new URL(env('SECONDARY_AI_BASE_URL')).host],
    timeoutMs: useOpenAi ? 180_000 : 120_000,
    maxTransientRetries: useOpenAi ? 1 : 2,
  });
  const model = env(useOpenAi ? 'OPENAI_MODEL' : 'SECONDARY_AI_MODEL');
  let pending = targets().filter((target) => !PUBLISHED_STABLE_CODES.has(target.code));
  if (level) pending = pending.filter((target) => target.cefr === level);
  if (limit > 0) pending = pending.slice(0, limit);

  let authored = 0;
  let skipped = 0;
  for (let offset = 0; offset < pending.length; offset += batchSize) {
    const candidates = pending.slice(offset, offset + batchSize);
    const batch: Target[] = [];
    for (const target of candidates) {
      const path = join(
        root,
        'content',
        'grammar',
        target.cefr.toLowerCase(),
        `${target.code.toLowerCase().replaceAll('_', '-')}.v2.json`,
      );
      if (resume) {
        try {
          const existing = JSON.parse(await readFile(path, 'utf8')) as unknown;
          if (validator.validateGrammarPointArtifact(existing, path).valid) {
            skipped += 1;
            continue;
          }
        } catch {
          /* Missing/invalid files are authored again. */
        }
      }
      batch.push(target);
    }
    if (batch.length === 0) continue;

    const result = useOpenAi
      ? await client.createResponse(
          model,
          'Follow the supplied authoring contract. Return valid JSON only.',
          prompt(batch),
          { format: { type: 'json_object' } },
        )
      : await client.chatCompletion(
          model,
          [
            {
              role: 'system',
              content: 'Follow the supplied authoring contract. Return valid JSON only.',
            },
            { role: 'user', content: prompt(batch) },
          ],
          { type: 'json_object' },
        );
    if (!result.ok)
      throw new Error(`AI authoring failed: ${result.errorCode} (HTTP ${result.status ?? 'n/a'})`);
    const parsed = extractJson(result.value) as { bundles?: GrammarBundle[] };
    if (!Array.isArray(parsed.bundles) || parsed.bundles.length !== batch.length) {
      throw new Error(`AI returned ${parsed.bundles?.length ?? 0}/${batch.length} bundles`);
    }

    for (const [index, bundle] of parsed.bundles.entries()) {
      const target = batch[index]!;
      const allowedTopLevelKeys = new Set([
        'schemaVersion',
        'code',
        'family',
        'version',
        'cefr',
        'status',
        'title',
        'learningObjectiveVi',
        'learningObjectiveEn',
        'form',
        'meaning',
        'usageConstraints',
        'relationships',
        'rules',
        'examples',
        'commonErrors',
        'generationPolicy',
        'evaluationPolicy',
        'provenance',
        'license',
      ]);
      for (const key of Object.keys(bundle)) {
        if (!allowedTopLevelKeys.has(key))
          delete (bundle as unknown as Record<string, unknown>)[key];
      }
      if (
        bundle.code !== target.code ||
        bundle.family !== target.family ||
        bundle.cefr !== target.cefr
      ) {
        throw new Error(`AI changed immutable identity for ${target.code}`);
      }
      bundle.version = 2;
      bundle.title = target.titleVi;
      bundle.form = {
        patterns: bundle.form.patterns,
        ...(bundle.form.morphologyNotes ? { morphologyNotes: bundle.form.morphologyNotes } : {}),
      };
      bundle.meaning = { uses: bundle.meaning.uses };
      bundle.relationships = {
        prerequisites: target.prerequisites,
        buildsOn: target.buildsOn,
        contrastsWith: target.contrastsWith,
        oftenConfusedWith: target.oftenConfusedWith,
      };
      bundle.generationPolicy = {
        ...bundle.generationPolicy,
        allowedContexts: bundle.generationPolicy?.allowedContexts ?? target.vocabularyDomains,
        maximumSentenceWords:
          target.cefr === 'A1'
            ? 14
            : target.cefr === 'A2'
              ? 18
              : target.cefr === 'B1'
                ? 24
                : target.cefr === 'B2'
                  ? 30
                  : target.cefr === 'C1'
                    ? 36
                    : 42,
        requireExplicitTarget: true,
      };
      bundle.provenance = {
        origin: 'AI_GENERATED',
        model,
        promptVersion: 'cf4-author-v2',
        generatedAt: new Date().toISOString(),
        sourceNotes: ['Independently authored for this personal application.'],
      };
      bundle.rules = bundle.rules.map((rule) => ({
        code: rule.code,
        type: rule.type,
        description: rule.description,
      }));
      bundle.examples = bundle.examples.map((example) => ({
        type: example.type,
        english: example.english,
        vietnamese: example.vietnamese,
        explanationVi: example.explanationVi,
      }));
      bundle.commonErrors = bundle.commonErrors.map((error) => ({
        code: error.code,
        incorrect: error.incorrect,
        corrected: error.corrected,
        explanationVi: error.explanationVi,
        severity: error.severity ?? 'MAJOR',
      }));
      const report = validator.validateGrammarPointArtifact(bundle, `${target.code}.v2.json`);
      if (!report.valid)
        throw new Error(`${target.code} failed CF0: ${JSON.stringify(report.findings)}`);
      const directory = join(root, 'content', 'grammar', target.cefr.toLowerCase());
      const path = join(directory, `${target.code.toLowerCase().replaceAll('_', '-')}.v2.json`);
      await mkdir(directory, { recursive: true });
      await writeFile(path, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
      authored += 1;
      console.log(`AUTHORED ${target.cefr} ${target.code}`);
    }
  }
  console.log(JSON.stringify({ authored, skipped, selected: pending.length }));
}

void main();
