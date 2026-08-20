import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { GrammarBundle } from '@english/contracts';
import type {
  GrammarKnowledgeBaseRepository,
  PublishedGrammarPoint,
} from '../application/grammar-kb.repository.js';

export class PrismaGrammarKnowledgeBaseRepository implements GrammarKnowledgeBaseRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async importDraft(bundle: GrammarBundle, contentHash: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const point = await tx.grammarPoint.upsert({
          where: { code: bundle.code },
          create: {
            code: bundle.code,
            familyCode: bundle.family,
            canonicalSlug: bundle.code.toLowerCase().replaceAll('_', '-'),
            status: 'DRAFT',
          },
          update: {},
          select: { id: true, familyCode: true },
        });
        if (point.familyCode !== bundle.family) throw new Error('GRAMMAR_POINT_FAMILY_IMMUTABLE');
        const existing = await tx.grammarPointVersion.findUnique({
          where: {
            grammarPointId_versionNo_locale: {
              grammarPointId: point.id,
              versionNo: bundle.version,
              locale: 'vi',
            },
          },
          select: { id: true },
        });
        if (existing) throw new Error('GRAMMAR_POINT_VERSION_EXISTS');
        await tx.grammarPointVersion.create({
          data: {
            grammarPointId: point.id,
            versionNo: bundle.version,
            cefrLevel: bundle.cefr,
            title: bundle.title,
            shortDescription: bundle.learningObjectiveVi,
            formSummary: bundle.form.patterns.join('\n'),
            meaningSummary: bundle.meaning.uses.join('\n'),
            usageNotes: bundle.usageConstraints.join('\n'),
            contentHash,
            status: 'DRAFT',
            learningObjectiveEn: bundle.learningObjectiveEn,
            provenanceJson: bundle.provenance,
            generationPolicyJson: toPrismaJson(bundle.generationPolicy),
            evaluationPolicyJson: toPrismaJson(bundle.evaluationPolicy),
            rules: {
              create: bundle.rules.map((rule, priority) => ({
                ruleCode: rule.code,
                ruleType: rule.type,
                description: rule.description,
                priority,
              })),
            },
            examples: {
              create: bundle.examples.map((example, sortOrder) => ({
                exampleType: example.type,
                englishText: example.english,
                vietnameseText: example.vietnamese,
                explanation: example.explanationVi,
                sortOrder,
              })),
            },
            errorPatterns: {
              create: bundle.commonErrors.map((error) => ({
                errorCode: error.code,
                incorrectPattern: error.incorrect,
                correctedPattern: error.corrected,
                explanationVi: error.explanationVi,
                severity: error.severity,
              })),
            },
          },
        });

        const relationGroups = [
          ['prerequisites', 'PREREQUISITE'],
          ['buildsOn', 'BUILDS_ON'],
          ['contrastsWith', 'CONTRASTS_WITH'],
          ['oftenConfusedWith', 'OFTEN_CONFUSED_WITH'],
        ] as const;
        for (const [key, relationshipType] of relationGroups) {
          for (const targetCode of bundle.relationships[key]) {
            const target = await tx.grammarPoint.findUnique({
              where: { code: targetCode },
              select: { id: true },
            });
            if (!target) throw new Error(`GRAMMAR_RELATIONSHIP_TARGET_MISSING:${targetCode}`);
            await tx.grammarRelationship.create({
              data: {
                sourcePointId: point.id,
                targetPointId: target.id,
                relationshipType,
                status: 'DRAFT',
              },
            });
          }
        }

        const [cycle] = await tx.$queryRaw<Array<{ has_cycle: boolean }>>`
          WITH RECURSIVE walk(source_id, target_id, path, cycle) AS (
            SELECT source_point_id, target_point_id, ARRAY[source_point_id], source_point_id = target_point_id
            FROM grammar_relationships WHERE relationship_type = 'PREREQUISITE'
            UNION ALL
            SELECT walk.source_id, edge.target_point_id, walk.path || edge.source_point_id,
                   edge.target_point_id = ANY(walk.path)
            FROM walk JOIN grammar_relationships edge ON edge.source_point_id = walk.target_id
            WHERE edge.relationship_type = 'PREREQUISITE' AND NOT walk.cycle
          )
          SELECT EXISTS (SELECT 1 FROM walk WHERE cycle) AS has_cycle`;
        if (cycle?.has_cycle) throw new Error('GRAMMAR_PREREQUISITE_CYCLE');
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /** Locks publication logically through serializable isolation; published versions are never updated again. */
  async publish(code: string, version: number): Promise<PublishedGrammarPoint> {
    return this.prisma.$transaction(
      async (tx) => {
        const record = await tx.grammarPointVersion.findFirst({
          where: { grammarPoint: { code }, versionNo: version, locale: 'vi' },
          select: { id: true, status: true, grammarPointId: true },
        });
        if (!record) throw new Error('GRAMMAR_POINT_VERSION_NOT_FOUND');
        if (record.status !== 'DRAFT' && record.status !== 'IN_REVIEW')
          throw new Error('GRAMMAR_POINT_VERSION_NOT_PUBLISHABLE');
        await tx.grammarPointVersion.update({
          where: { id: record.id },
          data: { status: 'PUBLISHED', publishedAt: new Date() },
        });
        await tx.grammarPoint.update({
          where: { id: record.grammarPointId },
          data: { status: 'PUBLISHED' },
        });
        await tx.grammarRelationship.updateMany({
          where: {
            sourcePointId: record.grammarPointId,
            status: { in: ['DRAFT', 'IN_REVIEW'] },
          },
          data: { status: 'PUBLISHED' },
        });
        const published = await tx.grammarPointVersion.findUniqueOrThrow({
          where: { id: record.id },
          select: {
            versionNo: true,
            cefrLevel: true,
            title: true,
            shortDescription: true,
            grammarPoint: { select: { code: true, familyCode: true } },
          },
        });
        return {
          code: published.grammarPoint.code,
          family: published.grammarPoint.familyCode,
          version: published.versionNo,
          cefr: published.cefrLevel,
          title: published.title,
          learningObjectiveVi: published.shortDescription,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async findPublished(code: string): Promise<PublishedGrammarPoint | null> {
    const row = await this.prisma.grammarPointVersion.findFirst({
      where: { grammarPoint: { code }, status: 'PUBLISHED' },
      orderBy: { versionNo: 'desc' },
      select: {
        versionNo: true,
        cefrLevel: true,
        title: true,
        shortDescription: true,
        grammarPoint: { select: { code: true, familyCode: true } },
      },
    });
    return row
      ? {
          code: row.grammarPoint.code,
          family: row.grammarPoint.familyCode,
          version: row.versionNo,
          cefr: row.cefrLevel,
          title: row.title,
          learningObjectiveVi: row.shortDescription,
        }
      : null;
  }
}

function toPrismaJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  // The bundle has already passed strict JSON Schema validation, so it cannot contain non-JSON values.
  return value as Prisma.InputJsonObject;
}
