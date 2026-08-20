import { PUBLISHED_STABLE_CODES } from '@english/contracts';
import { generateCoverageMatrix, type CoverageReport } from './coverage-matrix.js';

export interface CurriculumPointSpec {
  code: string;
  family: string;
  canonicalSlug: string;
  titleVi: string;
  titleEn: string;
  assessableDistinction: string;
  communicativeFunctions: string[];
  formBoundary: string;
  meaningBoundary: string;
  useBoundary: string;
  prerequisites: string[];
  buildsOn: string[];
  contrastsWith: string[];
  oftenConfusedWith: string[];
  vocabularyDomains: string[];
  rationale: string;
  sortOrder: number;
}

export interface CurriculumUnitSpec {
  code: string;
  titleVi: string;
  sortOrder: number;
  points: CurriculumPointSpec[];
}

export interface CurriculumLevelSpec {
  cefr: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  titleVi: string;
  sortOrder: number;
  units: CurriculumUnitSpec[];
}

export interface AutonomousManifest {
  schemaVersion: '1.0';
  manifestCode: string;
  version: number;
  policyVersion: 'content-factory-v1';
  status: 'DRAFT';
  levels: CurriculumLevelSpec[];
  provenance: {
    /** AI_GENERATED when content comes from a real provider call;
     *  DETERMINISTIC_TEMPLATE when generated from hardcoded curriculum data. */
    origin: 'AI_GENERATED' | 'DETERMINISTIC_TEMPLATE';
    provider: string;
    model: string;
    promptVersion: string;
    generatedAt: string;
    licenseClass: 'PUBLIC_CONTENT_ORIGINAL';
  };
}

export interface ManifestPlannerResult {
  manifest: AutonomousManifest;
  totalPointsCount: number;
  publishedStableCodesPreservedCount: number;
  coverageReport: CoverageReport;
}

export class ManifestPlanner {
  public generateFullAutonomousManifest(): ManifestPlannerResult {
    const levels: CurriculumLevelSpec[] = [
      this.buildA1Level(),
      this.buildA2Level(),
      this.buildB1Level(),
      this.buildB2Level(),
      this.buildC1Level(),
      this.buildC2Level(),
    ];

    const allPoints: CurriculumPointSpec[] = [];
    for (const lvl of levels) {
      for (const u of lvl.units) {
        allPoints.push(...u.points);
      }
    }

    let preservedCount = 0;
    for (const p of allPoints) {
      if (PUBLISHED_STABLE_CODES.has(p.code)) {
        preservedCount++;
      }
    }

    const coverageReport = generateCoverageMatrix(allPoints);

    const manifest: AutonomousManifest = {
      schemaVersion: '1.0',
      manifestCode: 'AUTONOMOUS_A1_C2_FULL_MANIFEST_235',
      version: 1,
      policyVersion: 'content-factory-v1',
      status: 'DRAFT',
      levels,
      // Manifest codes are deterministically generated from existing curriculum data
      // and hardcoded linguistic knowledge, not from a provider AI call.
      // Provenance must honestly reflect this to maintain audit integrity.
      provenance: {
        origin: 'DETERMINISTIC_TEMPLATE',
        provider: 'none',
        model: 'none',
        promptVersion: 'cf2-manifest-planner-v1',
        generatedAt: new Date().toISOString(),
        licenseClass: 'PUBLIC_CONTENT_ORIGINAL',
      },
    };

    return {
      manifest,
      totalPointsCount: allPoints.length,
      publishedStableCodesPreservedCount: preservedCount,
      coverageReport,
    };
  }

  private buildPoint(
    spec: Partial<CurriculumPointSpec> & {
      code: string;
      titleVi: string;
      titleEn: string;
      family: string;
      sortOrder: number;
    },
  ): CurriculumPointSpec {
    const slug = spec.canonicalSlug ?? spec.code.toLowerCase().replace(/_/g, '-');
    return {
      code: spec.code,
      family: spec.family,
      canonicalSlug: slug,
      titleVi: spec.titleVi,
      titleEn: spec.titleEn,
      assessableDistinction:
        spec.assessableDistinction ??
        `Sử dụng chính xác cấu trúc ${spec.titleVi} (${spec.code}) trong giao tiếp tiếng Anh`,
      communicativeFunctions: spec.communicativeFunctions ?? [`Giao tiếp diễn đạt ${spec.titleVi}`],
      formBoundary: spec.formBoundary ?? `Dạng thức ngữ pháp chuẩn cho ${spec.code}`,
      meaningBoundary: spec.meaningBoundary ?? `Ý nghĩa cốt lõi của ${spec.code}`,
      useBoundary: spec.useBoundary ?? `Ngữ cảnh sử dụng phù hợp cho ${spec.code}`,
      prerequisites: spec.prerequisites ?? [],
      buildsOn: spec.buildsOn ?? [],
      contrastsWith: spec.contrastsWith ?? [],
      oftenConfusedWith: spec.oftenConfusedWith ?? [],
      vocabularyDomains: spec.vocabularyDomains ?? ['Giao tiếp chung'],
      rationale: spec.rationale ?? `Điểm ngữ pháp quan trọng trong chương trình học ${spec.code}`,
      sortOrder: spec.sortOrder,
    };
  }

  private buildA1Level(): CurriculumLevelSpec {
    return {
      cefr: 'A1',
      titleVi: 'Nền tảng A1',
      sortOrder: 1,
      units: [
        {
          code: 'A1_U01_PRONOUNS_AND_BE',
          titleVi: 'Đại từ nhân xưng, động từ Be và sở hữu',
          sortOrder: 1,
          points: [
            this.buildPoint({
              code: 'SUBJECT_PRONOUNS',
              family: 'PRONOUNS',
              titleVi: 'Đại từ nhân xưng',
              titleEn: 'Subject Pronouns',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'BE_PRESENT_AFFIRMATIVE',
              family: 'BE_VERB',
              titleVi: 'Động từ Be khẳng định',
              titleEn: 'Be Affirmative',
              prerequisites: ['SUBJECT_PRONOUNS'],
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'BE_PRESENT_NEGATIVE',
              family: 'BE_VERB',
              titleVi: 'Động từ Be phủ định',
              titleEn: 'Be Negative',
              prerequisites: ['BE_PRESENT_AFFIRMATIVE'],
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'BE_PRESENT_QUESTIONS',
              family: 'BE_VERB',
              titleVi: 'Câu hỏi với động từ Be',
              titleEn: 'Be Questions',
              prerequisites: ['BE_PRESENT_NEGATIVE'],
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'POSSESSIVE_ADJECTIVES_BASIC',
              family: 'POSSESSION',
              titleVi: 'Tính từ sở hữu cơ bản',
              titleEn: 'Possessive Adjectives',
              prerequisites: ['SUBJECT_PRONOUNS'],
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'A1_OBJECT_PRONOUNS',
              family: 'PRONOUNS',
              titleVi: 'Đại từ tân ngữ (me, him, her)',
              titleEn: 'Object Pronouns',
              prerequisites: ['SUBJECT_PRONOUNS'],
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'A1_POSSESSIVE_PRONOUNS',
              family: 'POSSESSION',
              titleVi: 'Đại từ sở hữu (mine, yours)',
              titleEn: 'Possessive Pronouns',
              prerequisites: ['POSSESSIVE_ADJECTIVES_BASIC'],
              sortOrder: 7,
            }),
            this.buildPoint({
              code: 'A1_DEMONSTRATIVE_PRONOUNS',
              family: 'DETERMINERS',
              titleVi: 'Đại từ chỉ định (this, that, these, those)',
              titleEn: 'Demonstratives',
              prerequisites: ['SUBJECT_PRONOUNS'],
              sortOrder: 8,
            }),
          ],
        },
        {
          code: 'A1_U02_EXISTENCE_AND_ROUTINES',
          titleVi: 'Sự tồn tại và thói quen hàng ngày',
          sortOrder: 2,
          points: [
            this.buildPoint({
              code: 'THERE_IS_ARE',
              family: 'EXISTENTIAL_THERE',
              titleVi: 'Cấu trúc There is / There are',
              titleEn: 'There is / There are',
              prerequisites: ['BE_PRESENT_AFFIRMATIVE'],
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'HAVE_GOT_POSSESSION',
              family: 'POSSESSION',
              titleVi: 'Sở hữu với Have got',
              titleEn: 'Have got',
              prerequisites: ['BE_PRESENT_AFFIRMATIVE'],
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'PRESENT_SIMPLE_AFFIRMATIVE',
              family: 'PRESENT_TENSE',
              titleVi: 'Hiện tại đơn khẳng định',
              titleEn: 'Present Simple Affirmative',
              prerequisites: ['SUBJECT_PRONOUNS'],
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'PRESENT_SIMPLE_NEGATIVE',
              family: 'PRESENT_TENSE',
              titleVi: 'Hiện tại đơn phủ định',
              titleEn: 'Present Simple Negative',
              prerequisites: ['PRESENT_SIMPLE_AFFIRMATIVE'],
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'PRESENT_SIMPLE_QUESTIONS',
              family: 'PRESENT_TENSE',
              titleVi: 'Hiện tại đơn nghi vấn',
              titleEn: 'Present Simple Questions',
              prerequisites: ['PRESENT_SIMPLE_NEGATIVE'],
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'A1_ADVERBS_OF_FREQUENCY',
              family: 'TIME_ADVERBS',
              titleVi: 'Trạng từ chỉ tần suất (always, usually)',
              titleEn: 'Adverbs of Frequency',
              prerequisites: ['PRESENT_SIMPLE_AFFIRMATIVE'],
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'A1_PREPOSITIONS_OF_TIME',
              family: 'PREPOSITIONS',
              titleVi: 'Giới từ chỉ thời gian (at, in, on)',
              titleEn: 'Prepositions of Time',
              prerequisites: ['PRESENT_SIMPLE_AFFIRMATIVE'],
              sortOrder: 7,
            }),
            this.buildPoint({
              code: 'A1_PREPOSITIONS_OF_PLACE',
              family: 'PREPOSITIONS',
              titleVi: 'Giới từ chỉ nơi chốn cơ bản',
              titleEn: 'Prepositions of Place',
              prerequisites: ['BE_PRESENT_AFFIRMATIVE'],
              sortOrder: 8,
            }),
          ],
        },
        {
          code: 'A1_U03_ARTICLES_AND_NOUNS',
          titleVi: 'Mạo từ, danh từ số ít / số nhiều',
          sortOrder: 3,
          points: [
            this.buildPoint({
              code: 'A1_ARTICLES_A_AN',
              family: 'DETERMINERS',
              titleVi: 'Mạo từ không xác định A / An',
              titleEn: 'Indefinite Articles A/An',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'A1_ARTICLE_THE_BASIC',
              family: 'DETERMINERS',
              titleVi: 'Mạo từ xác định The cơ bản',
              titleEn: 'Definite Article The',
              prerequisites: ['A1_ARTICLES_A_AN'],
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'A1_PLURAL_NOUNS_REGULAR',
              family: 'NOUN_PHRASE',
              titleVi: 'Danh từ số nhiều có quy tắc (-s, -es)',
              titleEn: 'Regular Plural Nouns',
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'A1_PLURAL_NOUNS_IRREGULAR',
              family: 'NOUN_PHRASE',
              titleVi: 'Danh từ số nhiều bất quy tắc (men, children)',
              titleEn: 'Irregular Plural Nouns',
              prerequisites: ['A1_PLURAL_NOUNS_REGULAR'],
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'A1_POSSESSIVE_S',
              family: 'POSSESSION',
              titleVi: "Sở hữu cách ('s)",
              titleEn: "Possessive 's",
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'A1_IMPERATIVES_BASIC',
              family: 'CLAUSE_STRUCTURE',
              titleVi: 'Câu mệnh lệnh cơ bản',
              titleEn: 'Basic Imperatives',
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'A1_QUESTION_WORDS',
              family: 'QUESTIONS',
              titleVi: 'Từ hỏi Wh- (who, what, where, when)',
              titleEn: 'Wh- Question Words',
              prerequisites: ['BE_PRESENT_QUESTIONS'],
              sortOrder: 7,
            }),
          ],
        },
        {
          code: 'A1_U04_ABILITY_AND_REQUESTS',
          titleVi: 'Khả năng, yêu cầu và sở thích cơ bản',
          sortOrder: 4,
          points: [
            this.buildPoint({
              code: 'A1_MODAL_CAN_ABILITY',
              family: 'MODAL_VERBS',
              titleVi: 'Động từ khuyết thiếu Can chỉ khả năng',
              titleEn: 'Can for Ability',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'A1_MODAL_CAN_REQUEST',
              family: 'MODAL_VERBS',
              titleVi: 'Can trong lời yêu cầu / xin phép',
              titleEn: 'Can for Requests',
              prerequisites: ['A1_MODAL_CAN_ABILITY'],
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'A1_LIKE_ING',
              family: 'COMPLEMENTATION',
              titleVi: 'Diễn đạt sở thích với Like + V-ing',
              titleEn: 'Like + V-ing',
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'A1_WOULD_LIKE_WANT',
              family: 'COMPLEMENTATION',
              titleVi: 'Muốn / Muốn xin lịch sự với Would like',
              titleEn: 'Would like / Want to',
              prerequisites: ['A1_LIKE_ING'],
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'A1_CARDINAL_ORDINAL_NUMBERS',
              family: 'NOUN_PHRASE',
              titleVi: 'Số đếm và số thứ tự',
              titleEn: 'Numbers & Dates',
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'A1_TELLING_TIME',
              family: 'TIME_EXPRESSIONS',
              titleVi: 'Cách nói giờ trong tiếng Anh',
              titleEn: 'Telling Time',
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'A1_BASIC_CONNECTORS_AND_BUT',
              family: 'DISCOURSE_COHESION',
              titleVi: 'Từ nối cơ bản And, But, Or',
              titleEn: 'Basic Connectors And/But/Or',
              sortOrder: 7,
            }),
          ],
        },
      ],
    };
  }

  private buildA2Level(): CurriculumLevelSpec {
    return {
      cefr: 'A2',
      titleVi: 'Sơ cấp A2',
      sortOrder: 2,
      units: [
        {
          code: 'A2_U01_TIME_AND_ACTION',
          titleVi: 'Hành động trong quá khứ và hiện tại',
          sortOrder: 1,
          points: [
            this.buildPoint({
              code: 'PAST_SIMPLE_REGULAR',
              family: 'PAST_TENSE',
              titleVi: 'Quá khứ đơn động từ có quy tắc',
              titleEn: 'Past Simple Regular',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'PAST_SIMPLE_IRREGULAR',
              family: 'PAST_TENSE',
              titleVi: 'Quá khứ đơn động từ bất quy tắc',
              titleEn: 'Past Simple Irregular',
              prerequisites: ['PAST_SIMPLE_REGULAR'],
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'PAST_SIMPLE_NEGATIVE',
              family: 'PAST_TENSE',
              titleVi: 'Quá khứ đơn phủ định',
              titleEn: 'Past Simple Negative',
              prerequisites: ['PAST_SIMPLE_REGULAR'],
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'PAST_SIMPLE_QUESTIONS',
              family: 'PAST_TENSE',
              titleVi: 'Quá khứ đơn nghi vấn',
              titleEn: 'Past Simple Questions',
              prerequisites: ['PAST_SIMPLE_NEGATIVE'],
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'PRESENT_CONTINUOUS_NOW',
              family: 'PRESENT_TENSE',
              titleVi: 'Hiện tại tiếp diễn hành động đang diễn ra',
              titleEn: 'Present Continuous Now',
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'PRESENT_SIMPLE_VS_CONTINUOUS',
              family: 'PRESENT_TENSE',
              titleVi: 'Phân biệt Hiện tại đơn & Tiếp diễn',
              titleEn: 'Present Simple vs Continuous',
              prerequisites: ['PRESENT_CONTINUOUS_NOW'],
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'A2_PAST_SIMPLE_BE_WAS_WERE',
              family: 'PAST_TENSE',
              titleVi: 'Quá khứ đơn với Động từ Be (Was/Were)',
              titleEn: 'Past Simple Was/Were',
              sortOrder: 7,
            }),
          ],
        },
        {
          code: 'A2_U02_QUANTITY_COMPARISON_PLANS',
          titleVi: 'Số lượng, so sánh và dự định',
          sortOrder: 2,
          points: [
            this.buildPoint({
              code: 'COUNTABLE_UNCOUNTABLE_QUANTIFIERS',
              family: 'DETERMINERS',
              titleVi: 'Danh từ đếm được / không đếm được & Lượng từ',
              titleEn: 'Quantifiers',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'COMPARATIVE_ADJECTIVES',
              family: 'COMPARISON',
              titleVi: 'So sánh hơn với tính từ',
              titleEn: 'Comparative Adjectives',
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'SUPERLATIVE_ADJECTIVES',
              family: 'COMPARISON',
              titleVi: 'So sánh nhất với tính từ',
              titleEn: 'Superlative Adjectives',
              prerequisites: ['COMPARATIVE_ADJECTIVES'],
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'FUTURE_GOING_TO_PLANS',
              family: 'FUTURE_TENSE',
              titleVi: 'Tương lai gần với Be going to',
              titleEn: 'Going to for Plans',
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'A2_QUANTIFIERS_MUCH_MANY_A_LOT',
              family: 'DETERMINERS',
              titleVi: 'Lượng từ Much, Many, A lot of, A few, A little',
              titleEn: 'Much/Many/A lot of',
              prerequisites: ['COUNTABLE_UNCOUNTABLE_QUANTIFIERS'],
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'A2_COMPARATIVE_ADVERBS',
              family: 'COMPARISON',
              titleVi: 'So sánh hơn với trạng từ',
              titleEn: 'Comparative Adverbs',
              prerequisites: ['COMPARATIVE_ADJECTIVES'],
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'A2_AS_AS_EQUALITY',
              family: 'COMPARISON',
              titleVi: 'So sánh bằng với As...as',
              titleEn: 'As...as Equality',
              prerequisites: ['COMPARATIVE_ADJECTIVES'],
              sortOrder: 7,
            }),
          ],
        },
        {
          code: 'A2_U03_FUTURE_WILL_AND_MODALS',
          titleVi: 'Tương lai với Will và động từ khuyết thiếu sơ cấp',
          sortOrder: 3,
          points: [
            this.buildPoint({
              code: 'A2_FUTURE_WILL_PREDICTIONS',
              family: 'FUTURE_TENSE',
              titleVi: 'Tương lai đơn với Will chỉ dự đoán & quyết định tức thì',
              titleEn: 'Will for Predictions',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'A2_WILL_VS_GOING_TO',
              family: 'FUTURE_TENSE',
              titleVi: 'Phân biệt Will và Be going to',
              titleEn: 'Will vs Going to',
              prerequisites: ['A2_FUTURE_WILL_PREDICTIONS', 'FUTURE_GOING_TO_PLANS'],
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'A2_MODAL_MUST_HAVE_TO',
              family: 'MODAL_VERBS',
              titleVi: 'Must và Have to chỉ nghĩa bắt buộc',
              titleEn: 'Must / Have to',
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'A2_MODAL_SHOULD_ADVICE',
              family: 'MODAL_VERBS',
              titleVi: "Should / Shouldn't cho lời khuyên",
              titleEn: 'Should for Advice',
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'A2_MODAL_MAY_MIGHT_POSSIBILITY',
              family: 'MODAL_VERBS',
              titleVi: 'May / Might chỉ khả năng có thể xảy ra',
              titleEn: 'May / Might',
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'A2_MODAL_COULD_PAST_ABILITY',
              family: 'MODAL_VERBS',
              titleVi: 'Could chỉ khả năng trong quá khứ',
              titleEn: 'Could for Past Ability',
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'A2_PREPOSITIONS_OF_MOVEMENT',
              family: 'PREPOSITIONS',
              titleVi: 'Giới từ chỉ sự chuyển động (into, out of, through)',
              titleEn: 'Prepositions of Movement',
              sortOrder: 7,
            }),
          ],
        },
        {
          code: 'A2_U04_GERUNDS_INFINITIVES_BASIC',
          titleVi: 'Danh động từ và Động từ nguyên mẫu sơ cấp',
          sortOrder: 4,
          points: [
            this.buildPoint({
              code: 'A2_VERB_INFINITIVE_TO',
              family: 'COMPLEMENTATION',
              titleVi: 'Cấu trúc V + to-Infinitive (want to, decide to)',
              titleEn: 'Verb + to-Infinitive',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'A2_VERB_GERUND_ING',
              family: 'COMPLEMENTATION',
              titleVi: 'Cấu trúc V + Gerund (enjoy, finish, stop)',
              titleEn: 'Verb + Gerund',
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'A2_INFINITIVE_OF_PURPOSE',
              family: 'COMPLEMENTATION',
              titleVi: 'Động từ nguyên mẫu chỉ mục đích (to + V)',
              titleEn: 'Infinitive of Purpose',
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'A2_TOO_ENOUGH_ADJECTIVE',
              family: 'DETERMINERS',
              titleVi: 'Cấu trúc Too và Enough với tính từ',
              titleEn: 'Too and Enough',
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'A2_INDEFINITE_PRONOUNS',
              family: 'PRONOUNS',
              titleVi: 'Đại từ bất định (someone, anything, nowhere)',
              titleEn: 'Indefinite Pronouns',
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'A2_QUESTION_TAGS_BASIC',
              family: 'QUESTIONS',
              titleVi: 'Câu hỏi đuôi cơ bản',
              titleEn: 'Basic Question Tags',
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'A2_SO_NEITHER_AGREEMENT',
              family: 'DISCOURSE_COHESION',
              titleVi: 'Đồng ý với So do I / Neither do I',
              titleEn: 'So / Neither Agreement',
              sortOrder: 7,
            }),
          ],
        },
        {
          code: 'A2_U05_INTRO_PRESENT_PERFECT',
          titleVi: 'Giới thiệu Hiện tại hoàn thành & Câu điều kiện sơ cấp',
          sortOrder: 5,
          points: [
            this.buildPoint({
              code: 'A2_PRESENT_PERFECT_INTRO',
              family: 'PERFECT_ASPECT',
              titleVi: 'Nhập môn Hiện tại hoàn thành (have/has + V3)',
              titleEn: 'Intro Present Perfect',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'A2_ZERO_CONDITIONAL',
              family: 'CONDITIONALS',
              titleVi: 'Câu điều kiện loại 0 (Sự thật hiển nhiên)',
              titleEn: 'Zero Conditional',
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'A2_CONNECTORS_BECAUSE_SO',
              family: 'DISCOURSE_COHESION',
              titleVi: 'Từ nối chỉ nguyên nhân kết quả Because, So',
              titleEn: 'Connectors Because/So',
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'A2_CONNECTORS_ALTHOUGH_BUT',
              family: 'DISCOURSE_COHESION',
              titleVi: 'Từ nối chỉ nhượng bộ Although, But',
              titleEn: 'Connectors Although/But',
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'A2_RELATIVE_PRONOUNS_WHO_WHICH',
              family: 'RELATIVE_CLAUSES',
              titleVi: 'Đại từ quan hệ Who / Which / That cơ bản',
              titleEn: 'Basic Relative Pronouns',
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'A2_SUBJECT_OBJECT_QUESTIONS',
              family: 'QUESTIONS',
              titleVi: 'Câu hỏi chủ ngữ vs tân ngữ (Who saw you vs Who did you see)',
              titleEn: 'Subject vs Object Questions',
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'A2_EXCLAMATORY_SENTENCES',
              family: 'CLAUSE_STRUCTURE',
              titleVi: 'Câu cảm thán với What a... / How...',
              titleEn: 'Exclamations',
              sortOrder: 7,
            }),
          ],
        },
      ],
    };
  }

  private buildB1Level(): CurriculumLevelSpec {
    return {
      cefr: 'B1',
      titleVi: 'Trung cấp B1',
      sortOrder: 3,
      units: [
        {
          code: 'B1_U01_TIME_CONDITIONS',
          titleVi: 'Thời gian, trải nghiệm và điều kiện',
          sortOrder: 1,
          points: [
            this.buildPoint({
              code: 'PRESENT_PERFECT_EXPERIENCE',
              family: 'PERFECT_ASPECT',
              titleVi: 'Hiện tại hoàn thành chỉ trải nghiệm',
              titleEn: 'Present Perfect Experience',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'PRESENT_PERFECT_DURATION',
              family: 'PERFECT_ASPECT',
              titleVi: 'Hiện tại hoàn thành chỉ khoảng thời gian (For/Since)',
              titleEn: 'Present Perfect Duration',
              prerequisites: ['PRESENT_PERFECT_EXPERIENCE'],
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'PRESENT_PERFECT_VS_PAST_SIMPLE',
              family: 'PERFECT_ASPECT',
              titleVi: 'Phân biệt Hiện tại hoàn thành & Quá khứ đơn',
              titleEn: 'Present Perfect vs Past Simple',
              prerequisites: ['PRESENT_PERFECT_DURATION'],
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'PAST_CONTINUOUS_INTERRUPTED',
              family: 'PAST_TENSE',
              titleVi: 'Quá khứ tiếp diễn kết hợp Quá khứ đơn',
              titleEn: 'Past Continuous Interrupted',
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'FIRST_CONDITIONAL',
              family: 'CONDITIONALS',
              titleVi: 'Câu điều kiện loại 1',
              titleEn: 'First Conditional',
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'B1_PRESENT_PERFECT_CONTINUOUS',
              family: 'PERFECT_ASPECT',
              titleVi: 'Hiện tại hoàn thành tiếp diễn',
              titleEn: 'Present Perfect Continuous',
              prerequisites: ['PRESENT_PERFECT_DURATION'],
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'B1_USED_TO_WOULD_PAST_HABITS',
              family: 'PAST_TENSE',
              titleVi: 'Thói quen quá khứ với Used to & Would',
              titleEn: 'Used to vs Would',
              sortOrder: 7,
            }),
          ],
        },
        {
          code: 'B1_U02_VOICE_CLAUSES_MODALITY',
          titleVi: 'Modal, bị động và mệnh đề',
          sortOrder: 2,
          points: [
            this.buildPoint({
              code: 'SECOND_CONDITIONAL',
              family: 'CONDITIONALS',
              titleVi: 'Câu điều kiện loại 2',
              titleEn: 'Second Conditional',
              prerequisites: ['FIRST_CONDITIONAL'],
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'MODALS_OBLIGATION_ADVICE',
              family: 'MODAL_VERBS',
              titleVi: 'Modal chỉ bắt buộc & lời khuyên',
              titleEn: 'Modals of Obligation & Advice',
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'PASSIVE_PRESENT_PAST',
              family: 'PASSIVE_VOICE',
              titleVi: 'Câu bị động ở Hiện tại & Quá khứ',
              titleEn: 'Passive Present & Past',
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'RELATIVE_CLAUSES_DEFINING',
              family: 'RELATIVE_CLAUSES',
              titleVi: 'Mệnh đề quan hệ xác định',
              titleEn: 'Defining Relative Clauses',
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'REPORTED_SPEECH_STATEMENTS',
              family: 'REPORTED_SPEECH',
              titleVi: 'Câu tường thuật dạng trần thuật',
              titleEn: 'Reported Speech Statements',
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'B1_MODALS_DEDUCTION_PRESENT',
              family: 'MODAL_VERBS',
              titleVi: "Modal suy đoán ở hiện tại (Must, Can't, Might)",
              titleEn: 'Modals of Deduction Present',
              prerequisites: ['MODALS_OBLIGATION_ADVICE'],
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'B1_PASSIVE_FUTURE_PERFECT',
              family: 'PASSIVE_VOICE',
              titleVi: 'Câu bị động ở thì Tương lai & Hoàn thành',
              titleEn: 'Passive Future & Perfect',
              prerequisites: ['PASSIVE_PRESENT_PAST'],
              sortOrder: 7,
            }),
          ],
        },
        {
          code: 'B1_U03_ARTICLES_AND_NOUN_PHRASES',
          titleVi: 'Mạo từ nâng cao và danh từ tập hợp',
          sortOrder: 3,
          points: [
            this.buildPoint({
              code: 'B1_ARTICLES_ADVANCED_EXCLUSIONS',
              family: 'DETERMINERS',
              titleVi: 'Quy tắc dùng mạo từ nâng cao & trường hợp không dùng mạo từ (Zero Article)',
              titleEn: 'Zero Article Rules',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'B1_QUANTIFIERS_ALL_BOTH_NEITHER',
              family: 'DETERMINERS',
              titleVi: 'Lượng từ All, Both, Neither, Either, None',
              titleEn: 'Both/Neither/Either',
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'B1_REFLEXIVE_PRONOUNS',
              family: 'PRONOUNS',
              titleVi: 'Đại từ phản thân (myself, yourself, themselves)',
              titleEn: 'Reflexive Pronouns',
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'B1_COLLECTIVE_UNCOUNTABLE_NOUNS',
              family: 'NOUN_PHRASE',
              titleVi: 'Danh từ tập hợp & danh từ không đếm được dễ nhầm lẫn (advice, furniture)',
              titleEn: 'Uncountable Noun Nuances',
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'B1_ADJECTIVE_ORDER',
              family: 'NOUN_PHRASE',
              titleVi: 'Trật tự tính từ trước danh từ (OSASCOMP)',
              titleEn: 'Adjective Order',
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'B1_PARTICIPLE_ADJECTIVES_ED_ING',
              family: 'NOUN_PHRASE',
              titleVi: 'Tính từ đuôi -ed và -ing (bored vs boring)',
              titleEn: '-ed vs -ing Adjectives',
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'B1_COMPOUND_NOUNS',
              family: 'NOUN_PHRASE',
              titleVi: 'Danh từ ghép (toothpaste, bus stop)',
              titleEn: 'Compound Nouns',
              sortOrder: 7,
            }),
          ],
        },
        {
          code: 'B1_U04_CLAUSES_OF_PURPOSE_AND_RESULT',
          titleVi: 'Mệnh đề chỉ mục đích, nguyên nhân và kết quả',
          sortOrder: 4,
          points: [
            this.buildPoint({
              code: 'B1_CLAUSES_PURPOSE_IN_ORDER_TO',
              family: 'CLAUSE_STRUCTURE',
              titleVi: 'Mệnh đề mục đích với In order to / So as to / So that',
              titleEn: 'Clauses of Purpose',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'B1_SO_SUCH_THAT',
              family: 'CLAUSE_STRUCTURE',
              titleVi: 'Cấu trúc So...that và Such...that',
              titleEn: 'So / Such...that',
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'B1_CLAUSES_CONCESSION_DESPITE',
              family: 'CLAUSE_STRUCTURE',
              titleVi: 'Mệnh đề nhượng bộ với Despite / In spite of',
              titleEn: 'Despite / In spite of',
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'B1_EMBEDDED_QUESTIONS_INDIRECT',
              family: 'QUESTIONS',
              titleVi: 'Câu hỏi gián tiếp lịch sự (Do you know where...)',
              titleEn: 'Indirect Questions',
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'B1_QUESTION_TAGS_ADVANCED',
              family: 'QUESTIONS',
              titleVi: 'Câu hỏi đuôi nâng cao và các ngoại lệ',
              titleEn: 'Advanced Tag Questions',
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'B1_CAUSATIVE_HAVE_GET_SOMETHING_DONE',
              family: 'VOICE',
              titleVi: 'Thể sai khiến Have / Get something done',
              titleEn: 'Causative Have/Get',
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'B1_CLAUSES_RESULT_AS_A_RESULT',
              family: 'CLAUSE_STRUCTURE',
              titleVi: 'Mệnh đề chỉ kết quả As a result / Consequently',
              titleEn: 'Clauses of Result',
              sortOrder: 7,
            }),
          ],
        },
        {
          code: 'B1_U05_VERB_COMPLEMENTATION_AND_PHRASALS',
          titleVi: 'Bổ ngữ động từ và Cụm động từ trung cấp',
          sortOrder: 5,
          points: [
            this.buildPoint({
              code: 'B1_VERBS_FOLLOWED_BY_PREPOSITIONS',
              family: 'COMPLEMENTATION',
              titleVi: 'Động từ đi kèm giới từ cố định (depend on, succeed in)',
              titleEn: 'Verb + Preposition',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'B1_ADJECTIVE_PREPOSITION_COMBOS',
              family: 'COMPLEMENTATION',
              titleVi: 'Tính từ đi kèm giới từ cố định (interested in, good at)',
              titleEn: 'Adjective + Preposition',
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'B1_PHRASAL_VERBS_SEPARABLE',
              family: 'COMPLEMENTATION',
              titleVi: 'Cụm động từ tách rời được vs không tách rời được',
              titleEn: 'Separable Phrasal Verbs',
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'B1_WISH_PRESENT_DESIRE',
              family: 'CONDITIONALS',
              titleVi: 'Câu ước Wish + Past Simple cho ước muốn ở hiện tại',
              titleEn: 'Wish for Present',
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'B1_HAD_BETTER_WOULD_RATHER',
              family: 'MODAL_VERBS',
              titleVi: 'Cấu trúc Had better & Would rather',
              titleEn: 'Had better / Would rather',
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'B1_CONNECTORS_FURTHERMORE_HOWEVER',
              family: 'DISCOURSE_COHESION',
              titleVi: 'Từ liên kết văn viết (However, Furthermore, Therefore)',
              titleEn: 'Formal Linking Words',
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'B1_REPORTED_SUGGESTIONS_OFFERS',
              family: 'REPORTED_SPEECH',
              titleVi: 'Tường thuật gợi ý và đề nghị (suggest + Ving / offer to V)',
              titleEn: 'Reported Suggestions',
              sortOrder: 7,
            }),
          ],
        },
        {
          code: 'B1_U06_UNLESS_PROVIDED_CONDITIONS',
          titleVi: 'Các biến thể câu điều kiện B1',
          sortOrder: 6,
          points: [
            this.buildPoint({
              code: 'B1_UNLESS_CONDITIONAL',
              family: 'CONDITIONALS',
              titleVi: 'Câu điều kiện với Unless (Nếu không)',
              titleEn: 'Unless Conditionals',
              prerequisites: ['FIRST_CONDITIONAL'],
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'B1_PROVIDED_AS_LONG_AS',
              family: 'CONDITIONALS',
              titleVi: 'Điều kiện với Provided that / As long as',
              titleEn: 'Provided that / As long as',
              prerequisites: ['FIRST_CONDITIONAL'],
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'B1_IN_CASE_VS_IF',
              family: 'CONDITIONALS',
              titleVi: 'Phân biệt In case và If',
              titleEn: 'In case vs If',
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'B1_TIME_CLAUSES_FUTURE',
              family: 'TIME_CLAUSES',
              titleVi: 'Mệnh đề thời gian trong tương lai (When, As soon as + Present)',
              titleEn: 'Future Time Clauses',
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'B1_WHETHER_OR_NOT_CONDITIONS',
              family: 'CONDITIONALS',
              titleVi: 'Điều kiện với Whether or not',
              titleEn: 'Whether or not',
              sortOrder: 5,
            }),
          ],
        },
      ],
    };
  }

  private buildB2Level(): CurriculumLevelSpec {
    return {
      cefr: 'B2',
      titleVi: 'Trung cao cấp B2',
      sortOrder: 4,
      units: [
        {
          code: 'B2_U01_TIME_CONDITIONS',
          titleVi: 'Thời gian tương lai và điều kiện nâng cao',
          sortOrder: 1,
          points: [
            this.buildPoint({
              code: 'PAST_PERFECT_SEQUENCE',
              family: 'PERFECT_ASPECT',
              titleVi: 'Quá khứ hoàn thành chỉ thứ tự sự việc',
              titleEn: 'Past Perfect Sequence',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'FUTURE_CONTINUOUS',
              family: 'FUTURE_TENSE',
              titleVi: 'Tương lai tiếp diễn',
              titleEn: 'Future Continuous',
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'FUTURE_PERFECT',
              family: 'FUTURE_TENSE',
              titleVi: 'Tương lai hoàn thành',
              titleEn: 'Future Perfect',
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'THIRD_CONDITIONAL',
              family: 'CONDITIONALS',
              titleVi: 'Câu điều kiện loại 3',
              titleEn: 'Third Conditional',
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'MIXED_CONDITIONAL_PAST_PRESENT',
              family: 'CONDITIONALS',
              titleVi: 'Câu điều kiện hỗn hợp Quá khứ - Hiện tại',
              titleEn: 'Mixed Conditional Past-Present',
              prerequisites: ['THIRD_CONDITIONAL'],
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'B2_PAST_PERFECT_CONTINUOUS',
              family: 'PERFECT_ASPECT',
              titleVi: 'Quá khứ hoàn thành tiếp diễn',
              titleEn: 'Past Perfect Continuous',
              prerequisites: ['PAST_PERFECT_SEQUENCE'],
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'B2_FUTURE_IN_THE_PAST',
              family: 'FUTURE_TENSE',
              titleVi: 'Tương lai trong quá khứ (Was going to / Would)',
              titleEn: 'Future in the Past',
              sortOrder: 7,
            }),
            this.buildPoint({
              code: 'B2_FUTURE_PERFECT_CONTINUOUS',
              family: 'FUTURE_TENSE',
              titleVi: 'Tương lai hoàn thành tiếp diễn',
              titleEn: 'Future Perfect Continuous',
              sortOrder: 8,
            }),
          ],
        },
        {
          code: 'B2_U02_VOICE_CLAUSES_MODALITY',
          titleVi: 'Bị động, tường thuật và sắc thái nghĩa',
          sortOrder: 2,
          points: [
            this.buildPoint({
              code: 'PASSIVE_ADVANCED_FORMS',
              family: 'PASSIVE_VOICE',
              titleVi: 'Thể bị động nâng cao',
              titleEn: 'Advanced Passive Forms',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'REPORTED_SPEECH_QUESTIONS',
              family: 'REPORTED_SPEECH',
              titleVi: 'Câu tường thuật dạng câu hỏi',
              titleEn: 'Reported Questions',
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'RELATIVE_CLAUSES_NON_DEFINING',
              family: 'RELATIVE_CLAUSES',
              titleVi: 'Mệnh đề quan hệ không xác định',
              titleEn: 'Non-defining Relative Clauses',
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'MODAL_DEDUCTION_PRESENT_PAST',
              family: 'MODAL_VERBS',
              titleVi: 'Modal suy đoán quá khứ (Must have V3 / Should have V3)',
              titleEn: 'Past Modal Deduction',
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'GERUND_INFINITIVE_MEANING_CHANGE',
              family: 'COMPLEMENTATION',
              titleVi: 'Thay đổi ý nghĩa giữa Gerund và Infinitive (stop, remember, try)',
              titleEn: 'Gerund vs Infinitive Meaning Change',
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'B2_REPORTED_SPEECH_COMMANDS_REQUESTS',
              family: 'REPORTED_SPEECH',
              titleVi: 'Tường thuật lời yêu cầu, mệnh lệnh và đề nghị',
              titleEn: 'Reported Commands & Requests',
              prerequisites: ['REPORTED_SPEECH_QUESTIONS'],
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'B2_IMPERSONAL_PASSIVE_IT_IS_SAID',
              family: 'PASSIVE_VOICE',
              titleVi: 'Câu bị động khách quan (It is said that / He is believed to)',
              titleEn: 'Impersonal Passive',
              prerequisites: ['PASSIVE_ADVANCED_FORMS'],
              sortOrder: 7,
            }),
            this.buildPoint({
              code: 'B2_REPORTED_SPEECH_VERB_PATTERNS',
              family: 'REPORTED_SPEECH',
              titleVi: 'Các mô hình động từ tường thuật phức hợp (accuse, deny, warn)',
              titleEn: 'Reported Verb Patterns',
              sortOrder: 8,
            }),
          ],
        },
        {
          code: 'B2_U03_ADVANCED_RELATIVE_AND_PARTICIPLE',
          titleVi: 'Mệnh đề quan hệ rút gọn và phân từ',
          sortOrder: 3,
          points: [
            this.buildPoint({
              code: 'B2_REDUCED_RELATIVE_CLAUSES',
              family: 'RELATIVE_CLAUSES',
              titleVi: 'Mệnh đề quan hệ rút gọn bằng V-ing và V3',
              titleEn: 'Reduced Relative Clauses',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'B2_PARTICIPLE_CLAUSES_TIME_REASON',
              family: 'PARTICIPLE_CLAUSES',
              titleVi: 'Mệnh đề phân từ chỉ thời gian và lý do (Having finished...)',
              titleEn: 'Participle Clauses of Time & Reason',
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'B2_RELATIVE_PRONOUNS_PREPOSITIONS',
              family: 'RELATIVE_CLAUSES',
              titleVi: 'Mệnh đề quan hệ đi kèm giới từ (in which, to whom)',
              titleEn: 'Relative Pronouns with Prepositions',
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'B2_WHATEVER_WHICHEVER_EVER_WORDS',
              family: 'CLAUSE_STRUCTURE',
              titleVi: 'Mệnh đề nhượng bộ với Whatever, Wherever, However',
              titleEn: 'Whatever / Wherever / However',
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'B2_NOMINAL_CLAUSES_WHAT_WHETHEER',
              family: 'CLAUSE_STRUCTURE',
              titleVi: 'Mệnh đề danh từ làm chủ ngữ / tân ngữ (What he said was...)',
              titleEn: 'Nominal Clauses',
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'B2_WISH_REGRET_PAST',
              family: 'CONDITIONALS',
              titleVi: 'Câu ước Wish + Past Perfect diễn tả nuối tiếc quá khứ',
              titleEn: 'Wish for Past Regrets',
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'B2_IT_IS_HIGH_TIME',
              family: 'SUBJUNCTIVE',
              titleVi: "Cấu trúc It's high time / It's time + Past Simple",
              titleEn: "It's high time",
              sortOrder: 7,
            }),
            this.buildPoint({
              code: 'B2_PARTICIPLE_CLAUSES_RESULT',
              family: 'PARTICIPLE_CLAUSES',
              titleVi: 'Mệnh đề phân từ chỉ kết quả (thus causing..., thereby reducing...)',
              titleEn: 'Participle Clauses of Result',
              sortOrder: 8,
            }),
          ],
        },
        {
          code: 'B2_U04_INVERSION_AND_EMPHASIS_INTRO',
          titleVi: 'Đảo ngữ cơ bản và cấu trúc nhấn mạnh B2',
          sortOrder: 4,
          points: [
            this.buildPoint({
              code: 'B2_EMPHATIC_DO_DOES_DID',
              family: 'EMPHASIS',
              titleVi: 'Nhấn mạnh hành động với Do / Does / Did',
              titleEn: 'Emphatic Do/Does/Did',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'B2_NOT_ONLY_BUT_ALSO_INVERSION',
              family: 'INVERSION',
              titleVi: 'Đảo ngữ với Not only...but also',
              titleEn: 'Inversion Not only...but also',
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'B2_NO_SOONER_THAN_HARDLY_WHEN',
              family: 'INVERSION',
              titleVi: 'Cấu trúc Vừa mới...thì đã... (No sooner...than / Hardly...when)',
              titleEn: 'No sooner...than / Hardly...when',
              prerequisites: ['PAST_PERFECT_SEQUENCE'],
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'B2_DOUBLE_COMPARATIVES',
              family: 'COMPARISON',
              titleVi: 'So sánh kép (The more...the more...)',
              titleEn: 'Double Comparatives',
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'B2_GRADABLE_NON_GRADABLE_ADJECTIVES',
              family: 'NOUN_PHRASE',
              titleVi:
                'Tính từ tuyệt đối vs tính từ có cấp độ & Trạng từ cường độ (absolutely vs very)',
              titleEn: 'Gradable vs Absolute Adjectives',
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'B2_CLEFT_SENTENCES_IT_IS',
              family: 'CLEFT_SENTENCES',
              titleVi: 'Câu chẻ cơ bản với It is / It was...that',
              titleEn: 'Basic It-Cleft Sentences',
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'B2_PREPOSITIONAL_VERBS_THREE_PARTS',
              family: 'COMPLEMENTATION',
              titleVi: 'Cụm động từ 3 từ (look forward to, put up with, run out of)',
              titleEn: 'Three-part Phrasal Verbs',
              sortOrder: 7,
            }),
          ],
        },
        {
          code: 'B2_U05_DISCOURSE_MARKERS_EXPRESSING_OPINION',
          titleVi: 'Từ liên kết diễn ngôn và lập luận B2',
          sortOrder: 5,
          points: [
            this.buildPoint({
              code: 'B2_DISCOURSE_MARKERS_CONTRAST',
              family: 'DISCOURSE_COHESION',
              titleVi: 'Từ nối chỉ sự tương phản (Whereas, While, On the other hand)',
              titleEn: 'Contrast Markers',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'B2_DISCOURSE_MARKERS_EXEMPLIFICATION',
              family: 'DISCOURSE_COHESION',
              titleVi: 'Từ nối minh họa và làm rõ (For instance, Namely, In particular)',
              titleEn: 'Exemplification Markers',
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'B2_DISCOURSE_MARKERS_SUMMARISING',
              family: 'DISCOURSE_COHESION',
              titleVi: 'Từ nối tóm tắt & kết luận (In summary, Overall, To conclude)',
              titleEn: 'Summarising Markers',
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'B2_HEDGING_BASIC_SEEM_APPEAR',
              family: 'STANCE_HEDGING',
              titleVi: 'Kỹ thuật giảm nhẹ cơ bản với Seem, Appear, Tend to',
              titleEn: 'Basic Hedging',
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'B2_SUBJUNCTIVE_THAT_CLAUSES_BASIC',
              family: 'SUBJUNCTIVE',
              titleVi: 'Giả định thức cơ bản sau suggest, recommend, insist',
              titleEn: 'Basic Subjunctive',
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'B2_ELLIPSIS_IN_COMPARISONS',
              family: 'ELLIPSIS',
              titleVi: 'Lược từ trong câu so sánh và mốc thời gian',
              titleEn: 'Ellipsis in Comparison',
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'B2_SO_THAT_IN_ORDER_THAT',
              family: 'CLAUSE_STRUCTURE',
              titleVi: 'Mệnh đề chỉ mục đích So that / In order that có Modal',
              titleEn: 'So that with Modals',
              sortOrder: 7,
            }),
          ],
        },
        {
          code: 'B2_U06_ADVANCED_CONDITIONALS_AND_SUPPOSITIONS',
          titleVi: 'Các biến thể câu giả định B2',
          sortOrder: 6,
          points: [
            this.buildPoint({
              code: 'B2_SUPPOSE_SUPPOSING_CONDITIONAL',
              family: 'CONDITIONALS',
              titleVi: 'Giả định với Suppose / Supposing that',
              titleEn: 'Suppose / Supposing',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'B2_IMAGINE_CONDITIONAL',
              family: 'CONDITIONALS',
              titleVi: 'Giả định tưởng tượng với Imagine if...',
              titleEn: 'Imagine if',
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'B2_OTHERWISE_OR_ELSE',
              family: 'CONDITIONALS',
              titleVi: 'Diễn đạt điều kiện với Otherwise / Or else',
              titleEn: 'Otherwise / Or else',
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'B2_BUT_FOR_WITHOUT_CONDITIONAL',
              family: 'CONDITIONALS',
              titleVi: 'Cấu trúc But for / Without + Noun Phrase thay If',
              titleEn: 'But for / Without',
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'B2_WILL_WOULD_FOR_HABITS_REFUSAL',
              family: 'MODAL_VERBS',
              titleVi: 'Will / Would dùng chỉ thói quen đặc trưng hoặc sự từ chối ngoan cố',
              titleEn: 'Will/Would for Obstinacy',
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'B2_NEEDNT_HAVE_VS_DIDNT_NEED_TO',
              family: 'MODAL_VERBS',
              titleVi: "Phân biệt Needn't have V3 và Didn't need to V",
              titleEn: "Needn't have vs Didn't need to",
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'B2_IF_ONLY_REGRETS',
              family: 'CONDITIONALS',
              titleVi: 'Cấu trúc If only diễn tả hối tiếc và mong muốn',
              titleEn: 'If only Regrets',
              sortOrder: 7,
            }),
          ],
        },
      ],
    };
  }

  private buildC1Level(): CurriculumLevelSpec {
    return {
      cefr: 'C1',
      titleVi: 'Cao cấp C1',
      sortOrder: 5,
      units: [
        {
          code: 'C1_U01_STRUCTURE_AND_STANCE',
          titleVi: 'Cấu trúc, trọng tâm và lập trường',
          sortOrder: 1,
          points: [
            this.buildPoint({
              code: 'INVERSION_NEGATIVE_ADVERBIALS',
              family: 'INVERSION',
              titleVi: 'Đảo ngữ với trạng từ phủ định',
              titleEn: 'Inversion with Negative Adverbials',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'CLEFT_SENTENCES_FOCUS',
              family: 'CLEFT_SENTENCES',
              titleVi: 'Câu chẻ nhấn mạnh nâng cao (Wh-cleft & It-cleft)',
              titleEn: 'Advanced Cleft Focus',
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'PARTICIPLE_CLAUSES',
              family: 'PARTICIPLE_CLAUSES',
              titleVi: 'Mệnh đề phân từ nâng cao',
              titleEn: 'Advanced Participle Clauses',
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'NOMINALISATION_FORMAL_STYLE',
              family: 'NOMINALISATION',
              titleVi: 'Danh từ hóa trong văn phong trang trọng',
              titleEn: 'Formal Nominalisation',
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'MANDATIVE_SUBJUNCTIVE',
              family: 'SUBJUNCTIVE',
              titleVi: 'Giả định thức bắt buộc',
              titleEn: 'Mandative Subjunctive',
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'C1_INVERSION_ONLY_IF_ONLY_WHEN',
              family: 'INVERSION',
              titleVi: 'Đảo ngữ với Only if / Only when / Not until',
              titleEn: 'Inversion with Only if/when',
              prerequisites: ['INVERSION_NEGATIVE_ADVERBIALS'],
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'C1_ALL_CLEFT_SENTENCES',
              family: 'CLEFT_SENTENCES',
              titleVi: 'Câu chẻ với All (All I did was...)',
              titleEn: 'All-Cleft Focus',
              prerequisites: ['CLEFT_SENTENCES_FOCUS'],
              sortOrder: 7,
            }),
            this.buildPoint({
              code: 'C1_CLEFT_WH_SENTENCES',
              family: 'CLEFT_SENTENCES',
              titleVi: 'Câu chẻ Wh- mở rộng (What happened was...)',
              titleEn: 'Wh-Cleft Focus',
              prerequisites: ['CLEFT_SENTENCES_FOCUS'],
              sortOrder: 8,
            }),
          ],
        },
        {
          code: 'C1_U02_DISCOURSE_AND_REGISTER',
          titleVi: 'Liên kết, tường thuật và văn phong',
          sortOrder: 2,
          points: [
            this.buildPoint({
              code: 'ADVANCED_HEDGING',
              family: 'STANCE_HEDGING',
              titleVi: 'Kỹ thuật diễn đạt giảm nhẹ nâng cao',
              titleEn: 'Advanced Hedging Devices',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'ELLIPSIS_SUBSTITUTION',
              family: 'ELLIPSIS',
              titleVi: 'Lược từ và thay thế từ nâng cao',
              titleEn: 'Advanced Ellipsis & Substitution',
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'FRONTING_TOPICALISATION',
              family: 'TOPICALISATION',
              titleVi: 'Đảo ngữ đưa thành phần lên đầu để nhấn mạnh chủ đề',
              titleEn: 'Fronting & Topicalisation',
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'COMPLEX_PREPOSITIONAL_PHRASES',
              family: 'PREPOSITIONS',
              titleVi: 'Cụm giới từ phức hợp (in light of, with a view to)',
              titleEn: 'Complex Prepositional Phrases',
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'NARRATIVE_TENSE_MIXING',
              family: 'NARRATIVE_TENSES',
              titleVi: 'Phối hợp thì trong văn kể chuyện nâng cao',
              titleEn: 'Narrative Tense Mixing',
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'C1_SUBSTITUTE_WORDS_DO_SO_ONE_THAT',
              family: 'ELLIPSIS',
              titleVi: 'Từ thay thế nâng cao (Do so, One/Ones, That/Those of)',
              titleEn: 'Advanced Substitutions',
              prerequisites: ['ELLIPSIS_SUBSTITUTION'],
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'C1_REGISTER_SHIFT_ACADEMIC_LEGAL',
              family: 'REGISTER',
              titleVi: 'Chuyển đổi văn phong giữa giao tiếp và học thuật/pháp lý',
              titleEn: 'Academic & Formal Register Shifts',
              sortOrder: 7,
            }),
            this.buildPoint({
              code: 'C1_REGISTER_DIPLOMATIC_LANGUAGE',
              family: 'REGISTER',
              titleVi: 'Ngữ pháp ngoại giao và đàm phán (Softened assertions)',
              titleEn: 'Diplomatic Language Register',
              sortOrder: 8,
            }),
          ],
        },
        {
          code: 'C1_U03_ADVANCED_PASSIVE_AND_REPORTING',
          titleVi: 'Bị động phức hợp và Tường thuật học thuật C1',
          sortOrder: 3,
          points: [
            this.buildPoint({
              code: 'C1_PASSIVE_WITH_VERBS_OF_PERCEPTION',
              family: 'PASSIVE_VOICE',
              titleVi: 'Thể bị động với động từ tri giác (He was seen to enter)',
              titleEn: 'Passive of Perception Verbs',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'C1_ADVANCED_REPORTING_VERB_PATTERNS',
              family: 'REPORTED_SPEECH',
              titleVi: 'Cấu trúc động từ tường thuật học thuật (allege, concede, refute)',
              titleEn: 'Academic Reporting Verbs',
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'C1_PREPOSITIONAL_PASSIVES',
              family: 'PASSIVE_VOICE',
              titleVi: 'Bị động của cụm động từ phức hợp (The matter will be looked into)',
              titleEn: 'Prepositional Passives',
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'C1_SUBJECT_VERB_INVERSION_LOCATIVE',
              family: 'INVERSION',
              titleVi:
                'Đảo ngữ chỉ vị trí / chuyển động (Up went the prices / On the hill stood a castle)',
              titleEn: 'Locative Inversion',
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'C1_GERUND_INFINITIVE_PASSIVE_PERFECT',
              family: 'COMPLEMENTATION',
              titleVi:
                'Gerund & Infinitive ở thể bị động và hoàn thành (having been told, to have known)',
              titleEn: 'Perfect & Passive Non-finites',
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'C1_UNREAL_PAST_CONDITIONS',
              family: 'CONDITIONALS',
              titleVi: 'Thì quá khứ phản thực trong các mệnh đề phụ đặc biệt',
              titleEn: 'Unreal Past Conditions',
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'C1_WOULD_RATHER_PAST_SUBJECT_CHANGE',
              family: 'SUBJUNCTIVE',
              titleVi: 'Cấu trúc Would rather + S + Past Perfect khi thay đổi chủ ngữ',
              titleEn: 'Would rather with Subject Change',
              sortOrder: 7,
            }),
            this.buildPoint({
              code: 'C1_PASSIVE_CONTAINER_CLAUSES',
              family: 'PASSIVE_VOICE',
              titleVi: 'Bị động trong mệnh đề chứa phức hợp (It has been agreed that...)',
              titleEn: 'Passive Container Clauses',
              sortOrder: 8,
            }),
          ],
        },
        {
          code: 'C1_U04_COMPLEX_NOUN_PHRASES_AND_QUALIFIERS',
          titleVi: 'Cụm danh từ phức hợp và bổ ngữ C1',
          sortOrder: 4,
          points: [
            this.buildPoint({
              code: 'C1_POSTMODIFICATION_IN_NOUN_PHRASES',
              family: 'NOUN_PHRASE',
              titleVi: 'Bổ ngữ sau danh từ bằng cụm giới từ, tính từ và mệnh đề',
              titleEn: 'Noun Postmodification',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'C1_COMPOUND_ADJECTIVES_STRUCTURE',
              family: 'NOUN_PHRASE',
              titleVi: 'Tính từ ghép phức hợp (thought-provoking, state-of-the-art)',
              titleEn: 'Complex Compound Adjectives',
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'C1_DETERMINERS_OF_QUANTITY_COLLECTIVE',
              family: 'DETERMINERS',
              titleVi: 'Lượng từ trang trọng (a multitude of, a fraction of, a surplus of)',
              titleEn: 'Formal Quantifiers',
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'C1_COMPARATIVE_CLAUSES_OF_PROPORTION',
              family: 'COMPARISON',
              titleVi: 'Mệnh đề so sánh tỷ lệ thuận / nghịch phức tạp',
              titleEn: 'Proportional Comparatives',
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'C1_VERB_NOUN_COLLOCATIONS_LIGHT_VERBS',
              family: 'NOMINALISATION',
              titleVi: 'Kết hợp từ Động từ nhẹ + Danh từ (make an assertion, take exception to)',
              titleEn: 'Light Verb Collocations',
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'C1_ADVERBIAL_CLAUSES_OF_CONCESSION_EXTENDED',
              family: 'CLAUSE_STRUCTURE',
              titleVi: 'Mệnh đề nhượng bộ mở rộng (Much as I agree..., Albeit small...)',
              titleEn: 'Extended Concession Clauses',
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'C1_DOUBLE_NEGATIVES_EMPHASIS',
              family: 'NEGATION',
              titleVi: 'Phủ định kép để nhấn mạnh ý khẳng định trang trọng',
              titleEn: 'Emphatic Double Negatives',
              sortOrder: 7,
            }),
            this.buildPoint({
              code: 'C1_PREMODIFICATION_COMPLEX',
              family: 'NOUN_PHRASE',
              titleVi: 'Bổ ngữ trước danh từ đa tầng',
              titleEn: 'Complex Premodification',
              sortOrder: 8,
            }),
          ],
        },
        {
          code: 'C1_U05_DISCOURSE_COHESION_IN_ARGUMENTATION',
          titleVi: 'Diễn ngôn liên kết trong tranh luận C1',
          sortOrder: 5,
          points: [
            this.buildPoint({
              code: 'C1_PARALLEL_STRUCTURES_RHETORIC',
              family: 'DISCOURSE_COHESION',
              titleVi: 'Cấu trúc song song trong tu từ học',
              titleEn: 'Rhetorical Parallelism',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'C1_METADISCOURSE_MARKERS',
              family: 'DISCOURSE_COHESION',
              titleVi: 'Từ nối siêu diễn ngôn dẫn dắt lập luận (Turning to, As noted earlier)',
              titleEn: 'Metadiscourse Markers',
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'C1_CONCESSIVE_REFUTATION_PATTERNS',
              family: 'DISCOURSE_COHESION',
              titleVi: 'Mô hình nhượng bộ và bác bỏ trong lập luận',
              titleEn: 'Concessive Refutation',
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'C1_IMPLICIT_CONDITIONALS',
              family: 'CONDITIONALS',
              titleVi: 'Câu điều kiện ẩn không chứa liên từ điều kiện',
              titleEn: 'Implicit Conditionals',
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'C1_MODAL_AUXILIARIES_TENTATIVE_STANCE',
              family: 'STANCE_HEDGING',
              titleVi: 'Động từ khuyết thiếu thể hiện lập trường thăm dò / ngần ngại',
              titleEn: 'Tentative Modal Stance',
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'C1_PARENTHETICAL_EXPRESSIONS',
              family: 'CLAUSE_STRUCTURE',
              titleVi: 'Chèn mệnh đề ngoặc đơn (parenthetical) làm rõ quan điểm',
              titleEn: 'Parenthetical Clause Insertion',
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'C1_SENTENCE_ADVERBS_EVALUATIVE',
              family: 'STANCE_HEDGING',
              titleVi: 'Trạng từ đánh giá toàn câu (Regrettably, Paradoxically, Supposedly)',
              titleEn: 'Evaluative Sentence Adverbs',
              sortOrder: 7,
            }),
            this.buildPoint({
              code: 'C1_METADISCOURSE_ATTITUDE',
              family: 'STANCE_HEDGING',
              titleVi: 'Từ nối siêu diễn ngôn thể hiện thái độ',
              titleEn: 'Attitude Markers',
              sortOrder: 8,
            }),
          ],
        },
        {
          code: 'C1_U06_ADVANCED_TEMPORAL_AND_CAUSAL_RELATIONS',
          titleVi: 'Quan hệ thời gian & nhân quả phức hợp C1',
          sortOrder: 6,
          points: [
            this.buildPoint({
              code: 'C1_COMPLEX_CAUSAL_CONNECTORS',
              family: 'DISCOURSE_COHESION',
              titleVi: 'Từ nối nhân quả phức hợp (by virtue of, on account of, in consequence of)',
              titleEn: 'Complex Causal Connectors',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'C1_ANAPHORIC_AND_CATAPHORIC_REFERENCE',
              family: 'DISCOURSE_COHESION',
              titleVi: 'Tham chiếu ngược (Anaphora) và tham chiếu xuôi (Cataphora)',
              titleEn: 'Anaphoric & Cataphoric Reference',
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'C1_INDEPENDENT_ABSOLUTE_CLAUSES',
              family: 'PARTICIPLE_CLAUSES',
              titleVi: 'Mệnh đề tuyệt độc lập (Absolute Clauses: Weather permitting...)',
              titleEn: 'Absolute Participle Clauses',
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'C1_INDIRECT_SPEECH_ADVANCED_SHIFT',
              family: 'REPORTED_SPEECH',
              titleVi: 'Biến đổi thời gian & không gian gián tiếp phức tạp trong văn chính luận',
              titleEn: 'Advanced Indirect Deixis Shift',
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'C1_TEMPORAL_SEQUENCE_COMPLEX',
              family: 'TIME_CLAUSES',
              titleVi: 'Mối quan hệ thời gian nối tiếp đa tầng C1',
              titleEn: 'Complex Temporal Sequences',
              sortOrder: 5,
            }),
          ],
        },
      ],
    };
  }

  private buildC2Level(): CurriculumLevelSpec {
    return {
      cefr: 'C2',
      titleVi: 'Thành thạo C2',
      sortOrder: 6,
      units: [
        {
          code: 'C2_U01_STRUCTURE_AND_STANCE',
          titleVi: 'Cấu trúc phản thực và tổ chức thông tin',
          sortOrder: 1,
          points: [
            this.buildPoint({
              code: 'CONDITIONAL_INVERSION_WITHOUT_IF',
              family: 'CONDITIONALS',
              titleVi: 'Đảo ngữ câu điều kiện không dùng If',
              titleEn: 'Conditional Inversion Without If',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'PSEUDO_CLEFT_NUANCE',
              family: 'CLEFT_SENTENCES',
              titleVi: 'Câu giả chẻ và sắc thái tinh tế',
              titleEn: 'Pseudo-cleft Nuances',
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'MODALITY_FINE_GRAINED_STANCE',
              family: 'MODAL_VERBS',
              titleVi: 'Sắc thái quan điểm vi mô qua Modal',
              titleEn: 'Fine-grained Modal Stance',
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'COUNTERFACTUAL_MIXED_TIME',
              family: 'CONDITIONALS',
              titleVi: 'Cấu trúc phản thực thời gian hỗn hợp C2',
              titleEn: 'Counterfactual Mixed Time',
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'DISCOURSE_MARKERS_ARGUMENTATION',
              family: 'DISCOURSE_COHESION',
              titleVi: 'Từ nối lập luận chuyên sâu C2',
              titleEn: 'Argumentation Discourse Markers',
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'END_WEIGHT_INFORMATION_PACKAGING',
              family: 'INFORMATION_STRUCTURE',
              titleVi: 'Nguyên tắc trọng tâm cuối câu trong đóng gói thông tin',
              titleEn: 'End-weight Information Packaging',
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'C2_INVERTED_WHICHEVER_WHATEVER',
              family: 'INVERSION',
              titleVi: 'Đảo ngữ cấu trúc nhượng bộ tối cao',
              titleEn: 'Supreme Concessive Inversion',
              prerequisites: ['CONDITIONAL_INVERSION_WITHOUT_IF'],
              sortOrder: 7,
            }),
            this.buildPoint({
              code: 'C2_REVERSED_PSEUDO_CLEFT',
              family: 'CLEFT_SENTENCES',
              titleVi: 'Câu đảo giả chẻ (That is what I mean)',
              titleEn: 'Reversed Pseudo-cleft',
              prerequisites: ['PSEUDO_CLEFT_NUANCE'],
              sortOrder: 8,
            }),
            this.buildPoint({
              code: 'C2_INVERSION_CONDITIONALS_SHOULD_HAD_WERE',
              family: 'INVERSION',
              titleVi: 'Đảo ngữ điều kiện nâng cao với Should / Had / Were',
              titleEn: 'Inverted Conditionals Should/Had/Were',
              prerequisites: ['CONDITIONAL_INVERSION_WITHOUT_IF'],
              sortOrder: 9,
            }),
          ],
        },
        {
          code: 'C2_U02_DISCOURSE_AND_REGISTER',
          titleVi: 'Diễn ngôn, hàm ý và register',
          sortOrder: 2,
          points: [
            this.buildPoint({
              code: 'LITERARY_PAST_FORMS',
              family: 'NARRATIVE_TENSES',
              titleVi: 'Các dạng quá khứ trong văn học / phong cách cổ điển',
              titleEn: 'Literary Past Forms',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'EMBEDDED_CLAUSE_COMPLEXITY',
              family: 'CLAUSE_STRUCTURE',
              titleVi: 'Mệnh đề lồng phức hợp C2',
              titleEn: 'Embedded Clause Complexity',
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'PRAGMATIC_SOFTENING_IMPLICATION',
              family: 'STANCE_HEDGING',
              titleVi: 'Làm mềm câu ngữ dụng & hàm ý C2',
              titleEn: 'Pragmatic Softening & Implication',
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'REGISTER_SHIFT_GRAMMATICAL_CHOICES',
              family: 'REGISTER',
              titleVi: 'Chuyển đổi ngữ cảnh văn phong qua lựa chọn ngữ pháp',
              titleEn: 'Register Shift Grammatical Choices',
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'SCOPE_AMBIGUITY_CONTROL',
              family: 'COUNTERFACTUAL_SCOPE',
              titleVi: 'Kinh nghiệm kiểm soát sự mơ hồ phạm vi nghĩa',
              titleEn: 'Scope Ambiguity Control',
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'CORPUS_STYLE_GRAMMATICAL_PATTERNING',
              family: 'CORPUS_PATTERNS',
              titleVi: 'Mô hình ngữ pháp chuẩn theo Corpus',
              titleEn: 'Corpus-style Grammatical Patterning',
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'C2_ARCHAIC_AND_SOLEMN_SUBJUNCTIVE',
              family: 'SUBJUNCTIVE',
              titleVi:
                'Giả định thức trang trọng và cổ điển (Be that as it may, Suffice it to say)',
              titleEn: 'Solemn & Archaic Subjunctive',
              sortOrder: 7,
            }),
            this.buildPoint({
              code: 'C2_PRAGMATIC_IRONY_GRAMMAR',
              family: 'STANCE_HEDGING',
              titleVi: 'Cấu trúc ngữ pháp thể hiện châm biếm ngữ dụng (Irony / Sarcasm)',
              titleEn: 'Grammatical Pragmatic Irony',
              sortOrder: 8,
            }),
            this.buildPoint({
              code: 'C2_IRONY_PRAGMATIC_MARKERS',
              family: 'STANCE_HEDGING',
              titleVi: 'Từ đánh giá châm biếm và mỉa mai tu từ C2',
              titleEn: 'Pragmatic Irony Markers',
              sortOrder: 9,
            }),
          ],
        },
        {
          code: 'C2_U03_ADVANCED_RHETORICAL_GRAMMAR',
          titleVi: 'Ngữ pháp tu từ và tạo lập hình ảnh C2',
          sortOrder: 3,
          points: [
            this.buildPoint({
              code: 'C2_CHIASMUS_ANTIMETABOLE_STRUCTURES',
              family: 'RHETORICAL_STRUCTURES',
              titleVi: 'Cấu trúc đối xứng tu từ (Chiasmus & Antimetabole)',
              titleEn: 'Chiasmus & Antimetabole',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'C2_ASYNDETON_POLYSYNDETON',
              family: 'DISCOURSE_COHESION',
              titleVi: 'Kỹ thuật vắng từ nối (Asyndeton) và đa từ nối (Polysyndeton)',
              titleEn: 'Asyndeton & Polysyndeton',
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'C2_ELLIPTICAL_CLAUSE_DENSITY',
              family: 'ELLIPSIS',
              titleVi: 'Mật độ lược từ tối đa trong văn phong ngắn gọn C2',
              titleEn: 'Maximum Elliptical Density',
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'C2_NOMINAL_GROUP_COMPLEXITY',
              family: 'NOMINALISATION',
              titleVi: 'Độ phức hợp nhóm danh từ đỉnh cao trong báo chí chuyên sâu',
              titleEn: 'Nominal Group Complexity',
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'C2_METAPHORICAL_GRAMMAR_CHOICES',
              family: 'REGISTER',
              titleVi: 'Ẩn dụ ngữ pháp (Grammatical Metaphor)',
              titleEn: 'Grammatical Metaphor',
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'C2_HYPOTHETICAL_TIME_DISPLACEMENT',
              family: 'COUNTERFACTUAL_SCOPE',
              titleVi: 'Sự dịch chuyển thời gian giả định trong lập luận ngoại giao',
              titleEn: 'Hypothetical Time Displacement',
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'C2_INFORMATION_DENSITY_PACKAGING',
              family: 'INFORMATION_STRUCTURE',
              titleVi: 'Đóng gói mật độ thông tin cao trong văn bản khoa học C2',
              titleEn: 'Information Density Packaging',
              sortOrder: 7,
            }),
            this.buildPoint({
              code: 'C2_SCOPE_OF_NEGATION_NUANCES',
              family: 'NEGATION',
              titleVi: 'Phạm vi phủ định tinh tế trong câu phức hợp C2',
              titleEn: 'Scope of Negation Nuances',
              sortOrder: 8,
            }),
            this.buildPoint({
              code: 'C2_PARALLELISM_RHETORICAL_DENSITY',
              family: 'RHETORICAL_STRUCTURES',
              titleVi: 'Mật độ song song tu từ đỉnh cao C2',
              titleEn: 'Rhetorical Parallelism Density',
              sortOrder: 9,
            }),
          ],
        },
        {
          code: 'C2_U04_COMPLEX_DEIXIS_AND_STANCE',
          titleVi: 'Chỉ xuất phức hợp và định vị ngữ cảnh C2',
          sortOrder: 4,
          points: [
            this.buildPoint({
              code: 'C2_DEICTIC_PROXIMITY_DISTANCE',
              family: 'DISCOURSE_COHESION',
              titleVi: 'Khoảng cách ngữ dụng chỉ xuất (Deictic Proximity vs Distance)',
              titleEn: 'Deictic Proximity & Distance',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'C2_ATTITUDINAL_MODALITY_PATTERNS',
              family: 'MODAL_VERBS',
              titleVi: 'Mô hình Modal thể hiện thái độ tinh vi',
              titleEn: 'Attitudinal Modality Patterns',
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'C2_NON_RESTRICTIVE_APPOSITION',
              family: 'CLAUSE_STRUCTURE',
              titleVi: 'Đồng danh từ không hạn chế phức hợp',
              titleEn: 'Complex Non-restrictive Apposition',
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'C2_DISCOURSE_JUSTPOSITION',
              family: 'DISCOURSE_COHESION',
              titleVi: 'Sóng đôi diễn ngôn không dùng từ nối (Juxtaposition)',
              titleEn: 'Discourse Juxtaposition',
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'C2_REPORTED_DISCOURSE_FREE_INDIRECT',
              family: 'REPORTED_SPEECH',
              titleVi: 'Tường thuật gián tiếp tự do (Free Indirect Discourse in Literature)',
              titleEn: 'Free Indirect Discourse',
              sortOrder: 5,
            }),
            this.buildPoint({
              code: 'C2_THEMATIC_PROGRESSION_PATTERNS',
              family: 'INFORMATION_STRUCTURE',
              titleVi: 'Mô hình tiến trình chủ đề (Thematic Progression in Texts)',
              titleEn: 'Thematic Progression Patterns',
              sortOrder: 6,
            }),
            this.buildPoint({
              code: 'C2_EVALUATIVE_LEXICO_GRAMMAR',
              family: 'STANCE_HEDGING',
              titleVi: 'Ngữ pháp - từ vựng đánh giá lập trường C2',
              titleEn: 'Evaluative Lexicogrammar',
              sortOrder: 7,
            }),
            this.buildPoint({
              code: 'C2_SCOPE_AMBIGUITY_RESOLUTION',
              family: 'COUNTERFACTUAL_SCOPE',
              titleVi: 'Giải quyết mơ hồ phạm vi cú pháp C2',
              titleEn: 'Scope Ambiguity Resolution',
              sortOrder: 8,
            }),
          ],
        },
        {
          code: 'C2_U05_SUPREME_GRAMMATICAL_MASTERY',
          titleVi: 'Làm chủ ngữ pháp tối cao C2',
          sortOrder: 5,
          points: [
            this.buildPoint({
              code: 'C2_GENRE_SPECIFIC_PATTERNS',
              family: 'REGISTER',
              titleVi: 'Cấu trúc ngữ pháp đặc thù thể loại (Legal, Medical, Philosophy)',
              titleEn: 'Genre-specific Grammar Patterns',
              sortOrder: 1,
            }),
            this.buildPoint({
              code: 'C2_IDIOLECT_AND_STYLIZATION',
              family: 'REGISTER',
              titleVi: 'Cá thể hóa phong cách ngữ pháp (Idiolect)',
              titleEn: 'Idiolect & Stylization',
              sortOrder: 2,
            }),
            this.buildPoint({
              code: 'C2_COUNTERFACTUAL_DISCOURSE_CHAINS',
              family: 'CONDITIONALS',
              titleVi: 'Chuỗi lập luận phản thực liên tục trong văn bản',
              titleEn: 'Counterfactual Discourse Chains',
              sortOrder: 3,
            }),
            this.buildPoint({
              code: 'C2_EXHAUSTIVE_SYNTACTIC_FLEXIBILITY',
              family: 'CLAUSE_STRUCTURE',
              titleVi: 'Độ linh hoạt cú pháp tối đa trong tạo lập văn bản C2',
              titleEn: 'Syntactic Flexibility Mastery',
              sortOrder: 4,
            }),
            this.buildPoint({
              code: 'C2_MASTERY_SYNTACTIC_ELEGANCE',
              family: 'REGISTER',
              titleVi: 'Sự tinh tế ngữ pháp tối cao và nhịp điệu câu C2',
              titleEn: 'Syntactic Elegance Mastery',
              sortOrder: 5,
            }),
          ],
        },
      ],
    };
  }
}
