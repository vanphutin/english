import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { CurriculumReleaseSpec, CurriculumRepository, CurriculumView } from './types.js';

export class PrismaCurriculumRepository implements CurriculumRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async importDraft(spec: CurriculumReleaseSpec, contentHash: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const curriculum = await tx.curriculum.upsert({
          where: { code: spec.code },
          create: { code: spec.code, title: spec.title, status: 'DRAFT' },
          update: {},
          select: { id: true },
        });
        if (
          await tx.curriculumRelease.findUnique({
            where: {
              curriculumId_versionNo: { curriculumId: curriculum.id, versionNo: spec.version },
            },
            select: { id: true },
          })
        )
          throw new Error('CURRICULUM_RELEASE_EXISTS');
        const pinned = new Map<string, string>();
        for (const level of spec.levels)
          for (const unit of level.units)
            for (const item of unit.items) {
              const key = `${item.grammarPointCode}:${item.grammarPointVersion}`;
              if (!pinned.has(key)) {
                const version = await tx.grammarPointVersion.findFirst({
                  where: {
                    grammarPoint: { code: item.grammarPointCode },
                    versionNo: item.grammarPointVersion,
                    status: 'PUBLISHED',
                  },
                  select: { id: true },
                });
                if (!version) throw new Error(`CURRICULUM_ITEM_NOT_PUBLISHED:${key}`);
                pinned.set(key, version.id);
              }
            }
        await tx.curriculumRelease.create({
          data: {
            curriculumId: curriculum.id,
            versionNo: spec.version,
            status: 'DRAFT',
            contentHash,
            levels: {
              create: spec.levels.map((level, sortOrder) => ({
                code: level.code,
                cefrLevel: level.cefr,
                title: level.title,
                sortOrder,
                unlockPolicyJson: level.unlockPolicy as Prisma.InputJsonObject,
                units: {
                  create: level.units.map((unit, unitOrder) => ({
                    code: unit.code,
                    title: unit.title,
                    sortOrder: unitOrder,
                    items: {
                      create: unit.items.map((item, itemOrder) => ({
                        grammarPointVersionId: pinned.get(
                          `${item.grammarPointCode}:${item.grammarPointVersion}`,
                        )!,
                        role: item.role,
                        sortOrder: itemOrder,
                        weight: item.weight,
                        minimumEvidenceCount: item.minimumEvidenceCount,
                      })),
                    },
                  })),
                },
              })),
            },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async publish(code: string, version: number): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const release = await tx.curriculumRelease.findFirst({
          where: {
            curriculum: { code },
            versionNo: version,
            status: { in: ['DRAFT', 'IN_REVIEW'] },
          },
          select: { id: true, curriculumId: true },
        });
        if (!release) throw new Error('CURRICULUM_RELEASE_NOT_PUBLISHABLE');
        await tx.curriculumRelease.updateMany({
          where: { curriculumId: release.curriculumId, status: 'PUBLISHED' },
          data: { status: 'RETIRED' },
        });
        await tx.curriculumRelease.update({
          where: { id: release.id },
          data: { status: 'PUBLISHED', publishedAt: new Date() },
        });
        await tx.curriculum.update({
          where: { id: release.curriculumId },
          data: { status: 'PUBLISHED' },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async getActive(): Promise<CurriculumView | null> {
    const row = await this.prisma.curriculumRelease.findFirst({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      select: {
        versionNo: true,
        curriculum: { select: { code: true, title: true } },
        levels: {
          orderBy: { sortOrder: 'asc' },
          select: {
            code: true,
            cefrLevel: true,
            title: true,
            units: {
              orderBy: { sortOrder: 'asc' },
              select: {
                code: true,
                title: true,
                items: {
                  orderBy: { sortOrder: 'asc' },
                  select: {
                    role: true,
                    grammarPointVersion: {
                      select: { versionNo: true, grammarPoint: { select: { code: true } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    return row
      ? {
          code: row.curriculum.code,
          title: row.curriculum.title,
          version: row.versionNo,
          levels: row.levels.map((l) => ({
            code: l.code,
            cefr: l.cefrLevel,
            title: l.title,
            units: l.units.map((u) => ({
              code: u.code,
              title: u.title,
              items: u.items.map((i) => ({
                grammarPointCode: i.grammarPointVersion.grammarPoint.code,
                grammarPointVersion: i.grammarPointVersion.versionNo,
                role: i.role,
              })),
            })),
          })),
        }
      : null;
  }
}
