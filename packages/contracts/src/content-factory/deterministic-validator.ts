import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import curriculumManifestSchema from '../../schemas/curriculum-manifest.schema.json';
import grammarPointSchema from '../../schemas/grammar-point.schema.json';
import exerciseActivitySchema from '../../schemas/exercise-activity.schema.json';
import exerciseAuthoringBatchSchema from '../../schemas/exercise-authoring-batch.schema.json';
import { REASON_CODES, createFinding, type ValidationFinding } from './reason-code-registry.js';

export interface DeterministicValidationResult {
  valid: boolean;
  findings: ValidationFinding[];
  summary: {
    totalFindings: number;
    errorCount: number;
    blockingCount: number;
    warningCount: number;
    infoCount: number;
  };
}

// 62 Published stable codes in personal-english.v4.json
export const PUBLISHED_STABLE_CODES = new Set([
  'SUBJECT_PRONOUNS',
  'BE_PRESENT_AFFIRMATIVE',
  'BE_PRESENT_NEGATIVE',
  'BE_PRESENT_QUESTIONS',
  'POSSESSIVE_ADJECTIVES_BASIC',
  'THERE_IS_ARE',
  'HAVE_GOT_POSSESSION',
  'PRESENT_SIMPLE_AFFIRMATIVE',
  'PRESENT_SIMPLE_NEGATIVE',
  'PRESENT_SIMPLE_QUESTIONS',
  'PAST_SIMPLE_REGULAR',
  'PAST_SIMPLE_IRREGULAR',
  'PAST_SIMPLE_NEGATIVE',
  'PAST_SIMPLE_QUESTIONS',
  'PRESENT_CONTINUOUS_NOW',
  'PRESENT_SIMPLE_VS_CONTINUOUS',
  'COUNTABLE_UNCOUNTABLE_QUANTIFIERS',
  'COMPARATIVE_ADJECTIVES',
  'SUPERLATIVE_ADJECTIVES',
  'FUTURE_GOING_TO_PLANS',
  'PRESENT_PERFECT_EXPERIENCE',
  'PRESENT_PERFECT_DURATION',
  'PRESENT_PERFECT_VS_PAST_SIMPLE',
  'PAST_CONTINUOUS_INTERRUPTED',
  'FIRST_CONDITIONAL',
  'SECOND_CONDITIONAL',
  'MODALS_OBLIGATION_ADVICE',
  'PASSIVE_PRESENT_PAST',
  'RELATIVE_CLAUSES_DEFINING',
  'REPORTED_SPEECH_STATEMENTS',
  'PAST_PERFECT_SEQUENCE',
  'FUTURE_CONTINUOUS',
  'FUTURE_PERFECT',
  'THIRD_CONDITIONAL',
  'MIXED_CONDITIONAL_PAST_PRESENT',
  'PASSIVE_ADVANCED_FORMS',
  'REPORTED_SPEECH_QUESTIONS',
  'RELATIVE_CLAUSES_NON_DEFINING',
  'MODAL_DEDUCTION_PRESENT_PAST',
  'GERUND_INFINITIVE_MEANING_CHANGE',
  'INVERSION_NEGATIVE_ADVERBIALS',
  'CLEFT_SENTENCES_FOCUS',
  'PARTICIPLE_CLAUSES',
  'NOMINALISATION_FORMAL_STYLE',
  'MANDATIVE_SUBJUNCTIVE',
  'ADVANCED_HEDGING',
  'ELLIPSIS_SUBSTITUTION',
  'FRONTING_TOPICALISATION',
  'COMPLEX_PREPOSITIONAL_PHRASES',
  'NARRATIVE_TENSE_MIXING',
  'CONDITIONAL_INVERSION_WITHOUT_IF',
  'PSEUDO_CLEFT_NUANCE',
  'MODALITY_FINE_GRAINED_STANCE',
  'COUNTERFACTUAL_MIXED_TIME',
  'DISCOURSE_MARKERS_ARGUMENTATION',
  'END_WEIGHT_INFORMATION_PACKAGING',
  'LITERARY_PAST_FORMS',
  'EMBEDDED_CLAUSE_COMPLEXITY',
  'PRAGMATIC_SOFTENING_IMPLICATION',
  'REGISTER_SHIFT_GRAMMATICAL_CHOICES',
  'SCOPE_AMBIGUITY_CONTROL',
  'CORPUS_STYLE_GRAMMATICAL_PATTERNING',
]);

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(earlier|prior)\s+directives/i,
  /system\s+prompt\s*:/i,
  /\[admin\s+mode\]/i,
  /you\s+are\s+now\s+a\s+DAN/i,
];

const PLACEHOLDER_PATTERNS = [
  /illustrative sentence/i,
  /pattern structure for/i,
  /correct usage of [A-Z0-9]+(?:_[A-Z0-9]+)+/i,
  /incorrect usage of [A-Z0-9]+(?:_[A-Z0-9]+)+/i,
  /dạng thức ngữ pháp chuẩn cho/i,
  /ý nghĩa cốt lõi của [A-Z0-9_]+/i,
  /ngữ cảnh sử dụng phù hợp cho/i,
  /giao tiếp diễn đạt/i,
  /điểm ngữ pháp quan trọng trong chương trình/i,
];

// Mojibake patterns commonly resulting from mis-encoded UTF-8 in Vietnamese
const MOJIBAKE_PATTERNS = [/Ã¢|Ãª|Ã´|Ã|áº|Æ°|Ã|\uFFFD/g, /[Ã-Ã¿]{2,}/];

interface ManifestItemData {
  code?: unknown;
  prerequisites?: unknown;
}

interface ManifestUnitData {
  points?: unknown;
}

interface ManifestLevelData {
  units?: unknown;
}

interface ManifestData {
  items?: unknown;
  levels?: unknown;
  license?: unknown;
  provenance?: {
    licenseClass?: unknown;
  };
}

interface GrammarPointData {
  license?: unknown;
  title?: unknown;
  learningObjectiveVi?: unknown;
  form?: { patterns?: unknown };
  meaning?: { uses?: unknown };
  examples?: unknown;
  commonErrors?: unknown;
}

interface ExerciseItemData {
  contextVi?: unknown;
  instructionVi?: unknown;
  allowedAnswers?: unknown;
  hints?: unknown;
  semanticHash?: unknown;
}

interface ExerciseBatchData {
  exercises?: unknown;
}

export class ContentFactoryValidator {
  private ajv: Ajv2020;
  private validateManifest: ReturnType<Ajv2020['compile']>;
  private validateGrammarPoint: ReturnType<Ajv2020['compile']>;
  private validateExerciseActivity: ReturnType<Ajv2020['compile']>;
  private validateExerciseBatch: ReturnType<Ajv2020['compile']>;

  constructor() {
    this.ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(this.ajv);
    this.validateManifest = this.ajv.compile(curriculumManifestSchema);
    this.validateGrammarPoint = this.ajv.compile(grammarPointSchema);
    this.validateExerciseActivity = this.ajv.compile(exerciseActivitySchema);
    this.validateExerciseBatch = this.ajv.compile(exerciseAuthoringBatchSchema);
  }

  public validateManifestArtifact(
    input: unknown,
    artifactPath?: string,
  ): DeterministicValidationResult {
    const findings: ValidationFinding[] = [];

    // 1. JSON Schema validation
    const validSchema = this.validateManifest(input);
    if (!validSchema && this.validateManifest.errors) {
      for (const err of this.validateManifest.errors) {
        findings.push(
          createFinding({
            code: REASON_CODES.SCHEMA_VALIDATION_FAILED,
            severity: 'ERROR',
            artifactPath,
            messageVi: `Cấu trúc JSON Manifest không hợp lệ: ${err.instancePath || '/'} ${err.message ?? ''}`,
            evidence: JSON.stringify(err),
            suggestedAction: 'Sửa cấu trúc dữ liệu khớp với curriculum-manifest.schema.json',
          }),
        );
      }
    }

    if (typeof input !== 'object' || input === null) {
      return this.summarizeResults(findings);
    }

    const manifest = input as ManifestData;

    // 2. Mojibake and UTF-8 validation
    const jsonString = JSON.stringify(manifest);
    this.checkMojibake(jsonString, findings, artifactPath);

    // 3. Prompt injection check
    this.checkPromptInjection(jsonString, findings, artifactPath);

    // 4. Duplicate item codes & Graph prerequisites DAG
    const items: ManifestItemData[] = [];
    if (Array.isArray(manifest.items)) {
      for (const item of manifest.items) {
        if (item && typeof item === 'object') {
          items.push(item as ManifestItemData);
        }
      }
    }
    if (Array.isArray(manifest.levels)) {
      for (const lvl of manifest.levels as ManifestLevelData[]) {
        if (lvl && Array.isArray(lvl.units)) {
          for (const u of lvl.units as ManifestUnitData[]) {
            if (u && Array.isArray(u.points)) {
              for (const p of u.points as ManifestItemData[]) {
                if (p && typeof p === 'object') {
                  items.push(p);
                }
              }
            }
          }
        }
      }
    }

    const itemCodes = new Set<string>();
    const prereqGraph = new Map<string, string[]>();

    for (const item of items) {
      const code = typeof item.code === 'string' ? item.code : undefined;
      if (code) {
        if (itemCodes.has(code)) {
          findings.push(
            createFinding({
              code: REASON_CODES.DUPLICATE_ITEM_CODE,
              severity: 'BLOCKING',
              artifactPath,
              messageVi: `Trùng lặp mã bài học trong Manifest: ${code}`,
              evidence: `Mã ${code} xuất hiện nhiều hơn một lần trong manifest.`,
              suggestedAction: 'Đảm bảo mỗi GrammarPoint code là duy nhất.',
            }),
          );
        }
        itemCodes.add(code);

        const prereqs: string[] = [];
        if (Array.isArray(item.prerequisites)) {
          for (const pr of item.prerequisites) {
            if (typeof pr === 'string') {
              prereqs.push(pr);
            }
          }
        }
        prereqGraph.set(code, prereqs);
      }
    }

    for (const [code, prerequisites] of prereqGraph) {
      for (const prerequisite of prerequisites) {
        if (!itemCodes.has(prerequisite) && !PUBLISHED_STABLE_CODES.has(prerequisite)) {
          findings.push(
            createFinding({
              code: REASON_CODES.GRAPH_UNRESOLVED_PREREQUISITE,
              severity: 'BLOCKING',
              artifactPath,
              messageVi: `Điểm ${code} tham chiếu prerequisite không tồn tại: ${prerequisite}`,
              evidence: `${code} -> ${prerequisite}`,
              suggestedAction: 'Thêm prerequisite vào manifest hoặc sửa thành stable code hiện có.',
            }),
          );
        }
      }
    }

    // Graph DAG cycle detection
    this.checkGraphCycles(prereqGraph, findings, artifactPath);

    // 5. License check
    const license =
      typeof manifest.license === 'string'
        ? manifest.license
        : typeof manifest.provenance?.licenseClass === 'string'
          ? manifest.provenance.licenseClass
          : undefined;

    if (!license || (license !== 'PUBLIC_CONTENT' && license !== 'PUBLIC_CONTENT_ORIGINAL')) {
      findings.push(
        createFinding({
          code: REASON_CODES.LICENSE_MISSING_DECLARATION,
          severity: 'ERROR',
          artifactPath,
          messageVi: 'Thiếu hoặc sai tuyên bố giấy phép PUBLIC_CONTENT',
          evidence: `License declaration: ${license ?? 'undefined'}`,
          suggestedAction:
            'Khai báo "license": "PUBLIC_CONTENT" hoặc "provenance.licenseClass": "PUBLIC_CONTENT_ORIGINAL" trong Manifest.',
        }),
      );
    }

    return this.summarizeResults(findings);
  }

  public validateGrammarPointArtifact(
    input: unknown,
    artifactPath?: string,
  ): DeterministicValidationResult {
    const findings: ValidationFinding[] = [];

    const validSchema = this.validateGrammarPoint(input);
    if (!validSchema && this.validateGrammarPoint.errors) {
      for (const err of this.validateGrammarPoint.errors) {
        findings.push(
          createFinding({
            code: REASON_CODES.SCHEMA_VALIDATION_FAILED,
            severity: 'ERROR',
            artifactPath,
            messageVi: `Cấu trúc JSON GrammarPoint không hợp lệ: ${err.instancePath || '/'} ${err.message ?? ''}`,
            evidence: JSON.stringify(err),
            suggestedAction: 'Sửa nội dung cho đúng schema grammar-point.schema.json',
          }),
        );
      }
    }

    if (typeof input !== 'object' || input === null) {
      return this.summarizeResults(findings);
    }

    const point = input as GrammarPointData;
    const jsonString = JSON.stringify(point);

    this.checkMojibake(jsonString, findings, artifactPath);
    this.checkPromptInjection(jsonString, findings, artifactPath);
    this.checkPlaceholderContent(jsonString, findings, artifactPath);

    const examples = Array.isArray(point.examples) ? point.examples : [];
    const exampleTypes = new Set(
      examples.flatMap((example) =>
        example &&
        typeof example === 'object' &&
        'type' in example &&
        typeof example.type === 'string'
          ? [example.type]
          : [],
      ),
    );
    for (const requiredType of ['AFFIRMATIVE', 'NEGATIVE', 'QUESTION']) {
      if (!exampleTypes.has(requiredType))
        findings.push(
          createFinding({
            code: REASON_CODES.EXAMPLE_MISSING_REQUIRED_TYPES,
            severity: 'ERROR',
            artifactPath,
            messageVi: `Thiếu ví dụ bắt buộc loại ${requiredType}`,
            evidence: `Example types: ${[...exampleTypes].join(', ')}`,
            suggestedAction: `Bổ sung ví dụ ${requiredType} tự nhiên và đúng mục tiêu.`,
          }),
        );
    }

    // License check
    const license = typeof point.license === 'string' ? point.license : undefined;
    if (!license || license !== 'PUBLIC_CONTENT') {
      findings.push(
        createFinding({
          code: REASON_CODES.LICENSE_MISSING_DECLARATION,
          severity: 'ERROR',
          artifactPath,
          messageVi: 'GrammarPoint thiếu tuyên bố giấy phép PUBLIC_CONTENT',
          evidence: `License field: ${license ?? 'undefined'}`,
          suggestedAction: 'Gán thuộc tính "license": "PUBLIC_CONTENT".',
        }),
      );
    }

    return this.summarizeResults(findings);
  }

  public validateExerciseBatchArtifact(
    input: unknown,
    artifactPath?: string,
  ): DeterministicValidationResult {
    const findings: ValidationFinding[] = [];

    const validSchema = this.validateExerciseBatch(input);
    if (!validSchema && this.validateExerciseBatch.errors) {
      for (const err of this.validateExerciseBatch.errors) {
        findings.push(
          createFinding({
            code: REASON_CODES.SCHEMA_VALIDATION_FAILED,
            severity: 'ERROR',
            artifactPath,
            messageVi: `Cấu trúc JSON Exercise Batch không hợp lệ: ${err.instancePath || '/'} ${err.message ?? ''}`,
            evidence: JSON.stringify(err),
            suggestedAction: 'Sửa tập bài tập theo đúng exercise-authoring-batch.schema.json',
          }),
        );
      }
    }

    if (typeof input !== 'object' || input === null) {
      return this.summarizeResults(findings);
    }

    const batch = input as ExerciseBatchData;
    const jsonString = JSON.stringify(batch);

    this.checkMojibake(jsonString, findings, artifactPath);
    this.checkPromptInjection(jsonString, findings, artifactPath);

    // Check answer leakage in exercises
    const exercises: ExerciseItemData[] = [];
    if (Array.isArray(batch.exercises)) {
      for (const ex of batch.exercises) {
        if (ex && typeof ex === 'object') {
          exercises.push(ex as ExerciseItemData);
        }
      }
    }

    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      if (!ex) continue;

      const answers: string[] = [];
      if (Array.isArray(ex.allowedAnswers)) {
        for (const a of ex.allowedAnswers) {
          if (typeof a === 'string') answers.push(a);
        }
      }

      const contextVi = typeof ex.contextVi === 'string' ? ex.contextVi : '';
      const promptText = typeof ex.instructionVi === 'string' ? ex.instructionVi : '';
      const hintsText = Array.isArray(ex.hints)
        ? ex.hints.filter((hint): hint is string => typeof hint === 'string').join(' ')
        : '';

      for (const ans of answers) {
        if (ans.trim().length === 0) continue;
        const normalizedAns = ans.trim().toLowerCase();

        // If prompt/context explicitly tells the user the exact answer in quotes/parentheses
        if (
          contextVi.toLowerCase().includes(`'${normalizedAns}'`) ||
          contextVi.toLowerCase().includes(`"${normalizedAns}"`) ||
          promptText.toLowerCase().includes(`nhập: ${normalizedAns}`) ||
          promptText.toLowerCase().includes(`đáp án: ${normalizedAns}`) ||
          hintsText.toLowerCase().includes(normalizedAns)
        ) {
          findings.push(
            createFinding({
              code: REASON_CODES.ANSWER_LEAK_IN_PROMPT_OR_CONTEXT,
              severity: 'BLOCKING',
              artifactPath,
              messageVi: `Rò rỉ đáp án trong yêu cầu bài tập số ${i + 1}`,
              evidence: `Đáp án "${ans}" bị xuất hiện trực tiếp trong văn bản ngữ cảnh/đề bài: "${contextVi || promptText}"`,
              suggestedAction: 'Loại bỏ đáp án trực tiếp khỏi nội dung ngữ cảnh hoặc lời gợi ý.',
            }),
          );
        }
      }
    }

    return this.summarizeResults(findings);
  }

  private checkMojibake(text: string, findings: ValidationFinding[], artifactPath?: string): void {
    for (const pattern of MOJIBAKE_PATTERNS) {
      if (pattern.test(text)) {
        findings.push(
          createFinding({
            code: REASON_CODES.UNICODE_MOJIBAKE_DETECTED,
            severity: 'ERROR',
            artifactPath,
            messageVi: 'Phát hiện lỗi mã hóa ký tự Unicode/Mojibake trong văn bản tiếng Việt',
            evidence: 'Chuỗi văn bản chứa các ký tự vỡ font UTF-8 (ví dụ Ã, áº, Æ°).',
            suggestedAction: 'Đảm bảo tất cả tệp dữ liệu được lưu dưới dạng UTF-8 chuẩn.',
          }),
        );
        break;
      }
    }
  }

  private checkPromptInjection(
    text: string,
    findings: ValidationFinding[],
    artifactPath?: string,
  ): void {
    for (const pattern of PROMPT_INJECTION_PATTERNS) {
      if (pattern.test(text)) {
        findings.push(
          createFinding({
            code: REASON_CODES.SAFETY_PROMPT_INJECTION_DETECTED,
            severity: 'BLOCKING',
            artifactPath,
            messageVi: 'Phát hiện hành vi Prompt Injection nguy hiểm trong nội dung',
            evidence: `Trùng khớp với mẫu Prompt Injection: ${pattern.source}`,
            suggestedAction: 'Loại bỏ ngay các chỉ thị can thiệp hệ thống khỏi dữ liệu.',
          }),
        );
        break;
      }
    }
  }

  private checkPlaceholderContent(
    text: string,
    findings: ValidationFinding[],
    artifactPath?: string,
  ): void {
    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(text)) {
        findings.push(
          createFinding({
            code: REASON_CODES.GRANULARITY_PLACEHOLDER_CONTENT,
            severity: 'BLOCKING',
            artifactPath,
            messageVi: 'Phát hiện nội dung mẫu/placeholder thay vì bài học ngữ pháp thật.',
            evidence: `Matched placeholder pattern: ${pattern.source}`,
            suggestedAction: 'Tạo lại nội dung cụ thể cho đúng form–meaning–use của GrammarPoint.',
          }),
        );
        return;
      }
    }
  }

  private checkGraphCycles(
    graph: Map<string, string[]>,
    findings: ValidationFinding[],
    artifactPath?: string,
  ): void {
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (node: string, path: string[]): boolean => {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor, [...path])) return true;
        } else if (recStack.has(neighbor)) {
          path.push(neighbor);
          findings.push(
            createFinding({
              code: REASON_CODES.GRAPH_CYCLIC_PREREQUISITE,
              severity: 'BLOCKING',
              artifactPath,
              messageVi: `Phát hiện chu trình phụ thuộc vòng (Prerequisite Cycle) trong đồ thị curriculum`,
              evidence: `Chu trình: ${path.join(' -> ')}`,
              suggestedAction:
                'Loại bỏ phụ thuộc vòng để đảm bảo đồ thị là DAG (Directed Acyclic Graph).',
            }),
          );
          return true;
        }
      }

      recStack.delete(node);
      return false;
    };

    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }
  }

  private summarizeResults(findings: ValidationFinding[]): DeterministicValidationResult {
    let errorCount = 0;
    let blockingCount = 0;
    let warningCount = 0;
    let infoCount = 0;

    for (const f of findings) {
      if (f.severity === 'BLOCKING') blockingCount++;
      else if (f.severity === 'ERROR') errorCount++;
      else if (f.severity === 'WARNING') warningCount++;
      else if (f.severity === 'INFO') infoCount++;
    }

    const valid = errorCount === 0 && blockingCount === 0;

    return {
      valid,
      findings,
      summary: {
        totalFindings: findings.length,
        errorCount,
        blockingCount,
        warningCount,
        infoCount,
      },
    };
  }
}
