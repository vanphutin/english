import type { PrismaClient } from '@prisma/client';
import {
  consistencyPolicyVersion,
  dailySurpriseSeeds,
  dateKey,
  deterministicIndex,
  utcDate,
} from './consistency-policy.js';
import type {
  ConsistencyCalendarView,
  ConsistencyDayView,
  ConsistencyRepository,
  DailySurpriseView,
} from './consistency-types.js';

const rhythm = (days: ConsistencyDayView[], today: Date): { current: number; best: number } => {
  const active = new Set(days.filter((day) => day.type !== 'EMPTY').map((day) => day.date));
  let best = 0;
  let run = 0;
  let previous: Date | null = null;
  for (const key of [...active].sort()) {
    const date = new Date(`${key}T00:00:00Z`);
    run = previous && date.getTime() - previous.getTime() === 86_400_000 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }
  let current = 0;
  const cursor = utcDate(today);
  while (active.has(dateKey(cursor))) {
    current += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return { current, best };
};

export class PrismaConsistencyRepository implements ConsistencyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private async refreshLearningEvidence(userId: string): Promise<void> {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 35);
    const evaluations = await this.prisma.evaluation.findMany({
      where: {
        isEffective: true,
        completedAt: { gte: since },
        disposition: { in: ['ACCEPT', 'ACCEPT_WITH_FEEDBACK', 'RETRY'] },
        attempt: { userId },
      },
      select: { id: true, completedAt: true },
      orderBy: { completedAt: 'asc' },
    });
    const groups = new Map<string, string[]>();
    for (const evaluation of evaluations)
      groups.set(dateKey(evaluation.completedAt), [
        ...(groups.get(dateKey(evaluation.completedAt)) ?? []),
        `evaluation:${evaluation.id}`,
      ]);
    for (const [key, refs] of groups)
      await this.prisma.meaningfulLearningDay.upsert({
        where: { userId_learningDate: { userId, learningDate: new Date(`${key}T00:00:00Z`) } },
        create: {
          userId,
          learningDate: new Date(`${key}T00:00:00Z`),
          dayType: 'LEARNING',
          evidenceCount: refs.length,
          evidenceRefs: refs,
          policyVersion: consistencyPolicyVersion,
        },
        update: {
          dayType: 'LEARNING',
          evidenceCount: refs.length,
          evidenceRefs: refs,
          policyVersion: consistencyPolicyVersion,
        },
      });
  }

  async getCalendar(userId: string, now = new Date()): Promise<ConsistencyCalendarView> {
    await this.refreshLearningEvidence(userId);
    const from = utcDate(now);
    from.setUTCDate(from.getUTCDate() - 27);
    const rows = await this.prisma.meaningfulLearningDay.findMany({
      where: { userId, learningDate: { gte: from, lte: utcDate(now) } },
      orderBy: { learningDate: 'asc' },
    });
    const stored = new Map(rows.map((row) => [dateKey(row.learningDate), row]));
    const days: ConsistencyDayView[] = Array.from({ length: 28 }, (_, offset) => {
      const date = new Date(from);
      date.setUTCDate(date.getUTCDate() + offset);
      const row = stored.get(dateKey(date));
      return {
        date: dateKey(date),
        type: row ? (row.dayType as 'LEARNING' | 'REST') : 'EMPTY',
        evidenceCount: row?.evidenceCount ?? 0,
      };
    });
    const runs = rhythm(days, now);
    return {
      policyVersion: consistencyPolicyVersion,
      days,
      meaningfulDayCount: days.filter((day) => day.type === 'LEARNING').length,
      currentRhythm: runs.current,
      bestRhythm: runs.best,
      messageVi:
        'Mỗi ngày có bằng chứng đều đáng ghi nhận. Nghỉ một ngày không làm mất tiến bộ của bạn.',
    };
  }

  async markRestDay(
    userId: string,
    date: Date,
    now = new Date(),
  ): Promise<ConsistencyCalendarView> {
    await this.prisma.meaningfulLearningDay.upsert({
      where: { userId_learningDate: { userId, learningDate: utcDate(date) } },
      create: {
        userId,
        learningDate: utcDate(date),
        dayType: 'REST',
        policyVersion: consistencyPolicyVersion,
      },
      update: {},
    });
    return this.getCalendar(userId, now);
  }

  async getDailySurprise(userId: string, now = new Date()): Promise<DailySurpriseView | null> {
    for (const [contentKey, cefrLevel, type, titleVi, bodyVi, topicCode] of dailySurpriseSeeds)
      await this.prisma.dailySurprise.upsert({
        where: { contentKey },
        create: {
          contentKey,
          cefrLevel,
          type,
          titleVi,
          bodyVi,
          topicCode,
          policyVersion: consistencyPolicyVersion,
          status: 'PUBLISHED',
        },
        update: {},
      });
    const enrollment = await this.prisma.userCurriculumEnrollment.findFirst({
      where: { userId, status: 'ACTIVE' },
      select: { currentLevel: { select: { cefrLevel: true } } },
    });
    const cefr = enrollment?.currentLevel?.cefrLevel ?? 'A1';
    const published = await this.prisma.dailySurprise.findMany({
      where: { status: 'PUBLISHED', cefrLevel: cefr },
      orderBy: { contentKey: 'asc' },
    });
    if (!published.length) return null;
    const surpriseDate = utcDate(now);
    const selected = published[deterministicIndex(`${userId}:${dateKey(now)}`, published.length)]!;
    const view = await this.prisma.userDailySurprise.upsert({
      where: { userId_surpriseDate: { userId, surpriseDate } },
      create: { userId, surpriseDate, surpriseId: selected.id },
      update: {},
      include: { surprise: true },
    });
    return {
      date: dateKey(now),
      contentKey: view.surprise.contentKey,
      cefr: view.surprise.cefrLevel,
      type: view.surprise.type,
      titleVi: view.surprise.titleVi,
      bodyVi: view.surprise.bodyVi,
      topicCode: view.surprise.topicCode,
      optional: true,
    };
  }
}
