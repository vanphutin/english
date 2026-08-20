import type { Prisma, PrismaClient } from '@prisma/client';
import {
  achievementSeeds,
  approvedInterestTopics,
  growthPolicyVersion,
  weekBounds,
  type InterestTopicCode,
} from './growth-policy.js';
import type {
  AchievementView,
  GrowthRepository,
  WeeklyClaim,
  WeeklyReflectionView,
} from './growth-types.js';

export class PrismaGrowthRepository implements GrowthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getInterests(userId: string) {
    const rows = await this.prisma.learnerInterestPreference.findMany({
      where: { userId },
      orderBy: { priority: 'asc' },
    });
    return {
      approvedTopics: approvedInterestTopics,
      selectedTopics: rows.map((row) => row.topicCode as InterestTopicCode),
    };
  }

  async replaceInterests(userId: string, topics: InterestTopicCode[]) {
    await this.prisma.$transaction(async (tx) => {
      await tx.learnerInterestPreference.deleteMany({ where: { userId } });
      if (topics.length)
        await tx.learnerInterestPreference.createMany({
          data: topics.map((topicCode, priority) => ({ userId, topicCode, priority })),
        });
    });
    return this.getInterests(userId);
  }

  async refreshAchievements(userId: string): Promise<AchievementView[]> {
    for (const seed of achievementSeeds)
      await this.prisma.achievementDefinition.upsert({
        where: { code: seed.code },
        create: { ...seed, policyVersion: growthPolicyVersion },
        update: { ...seed, policyVersion: growthPolicyVersion, status: 'ACTIVE' },
      });
    const [masteries, resolvedErrors, completedStories] = await Promise.all([
      this.prisma.userGrammarMastery.findMany({
        where: { userId, independentSuccessCount: { gte: 1 } },
        select: { grammarPointId: true, independentSuccessCount: true },
      }),
      this.prisma.learnerErrorPattern.findMany({
        where: { userId, state: 'RESOLVED' },
        select: { id: true },
      }),
      this.prisma.userStoryProgress.findMany({
        where: { userId, status: 'COMPLETED' },
        select: { id: true },
      }),
    ]);
    const totalIndependent = masteries.reduce((sum, row) => sum + row.independentSuccessCount, 0);
    const evidence = new Map<
      string,
      { eligible: boolean; key: string; snapshot: Record<string, unknown> }
    >([
      [
        'FIRST_INDEPENDENT_SUCCESS',
        {
          eligible: totalIndependent >= 1,
          key: `independent:${masteries[0]?.grammarPointId ?? 'none'}`,
          snapshot: { grammarPointIds: masteries.map((x) => x.grammarPointId), totalIndependent },
        },
      ],
      [
        'GRAMMAR_EXPLORER_5',
        {
          eligible: masteries.length >= 5,
          key: `distinct-grammar:${masteries.length}`,
          snapshot: {
            grammarPointIds: masteries.map((x) => x.grammarPointId),
            distinctCount: masteries.length,
          },
        },
      ],
      [
        'ERROR_REPAIRER',
        {
          eligible: resolvedErrors.length >= 1,
          key: `resolved-error:${resolvedErrors[0]?.id ?? 'none'}`,
          snapshot: { errorPatternIds: resolvedErrors.map((x) => x.id) },
        },
      ],
      [
        'STORY_FINISHER',
        {
          eligible: completedStories.length >= 1,
          key: `completed-story:${completedStories[0]?.id ?? 'none'}`,
          snapshot: { storyProgressIds: completedStories.map((x) => x.id) },
        },
      ],
    ]);
    const definitions = await this.prisma.achievementDefinition.findMany({
      where: { status: 'ACTIVE', policyVersion: growthPolicyVersion },
    });
    for (const definition of definitions) {
      const proof = evidence.get(definition.code);
      if (proof?.eligible)
        await this.prisma.achievementGrant.upsert({
          where: {
            userId_achievementDefinitionId: { userId, achievementDefinitionId: definition.id },
          },
          create: {
            userId,
            achievementDefinitionId: definition.id,
            evidenceKey: proof.key,
            evidenceSnapshotJson: proof.snapshot as Prisma.InputJsonValue,
            policyVersion: growthPolicyVersion,
          },
          update: {},
        });
    }
    const rows = await this.prisma.achievementDefinition.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { code: 'asc' },
      include: { grants: { where: { userId }, take: 1 } },
    });
    return rows.map((row): AchievementView => ({
      code: row.code,
      titleVi: row.titleVi,
      descriptionVi: row.descriptionVi,
      granted: !!row.grants[0],
      grantedAt: row.grants[0]?.grantedAt.toISOString() ?? null,
      evidence: (row.grants[0]?.evidenceSnapshotJson as Record<string, unknown>) ?? null,
    }));
  }

  async generateWeeklyReflection(userId: string, now = new Date()): Promise<WeeklyReflectionView> {
    const { start, end } = weekBounds(now);
    const [events, evaluations, errors] = await Promise.all([
      this.prisma.masteryEvent.findMany({
        where: { userId, occurredAt: { gte: start, lt: end } },
        select: { id: true, grammarPointId: true, evidenceType: true, scoreDelta: true },
      }),
      this.prisma.evaluation.findMany({
        where: { isEffective: true, completedAt: { gte: start, lt: end }, attempt: { userId } },
        select: {
          id: true,
          disposition: true,
          attempt: { select: { exercise: { select: { topicCode: true } } } },
        },
      }),
      this.prisma.learnerErrorPattern.findMany({
        where: { userId },
        select: {
          id: true,
          state: true,
          grammarPoint: {
            select: {
              versions: {
                where: { status: 'PUBLISHED', locale: 'vi' },
                orderBy: { versionNo: 'desc' },
                take: 1,
                select: { title: true },
              },
            },
          },
        },
        orderBy: { lastSeenAt: 'desc' },
      }),
    ]);
    const positive = events.filter((event) => Number(event.scoreDelta) > 0);
    const accepted = evaluations.filter((event) =>
      ['ACCEPT', 'ACCEPT_WITH_FEEDBACK'].includes(event.disposition),
    );
    const topics = [...new Set(evaluations.map((event) => event.attempt.exercise.topicCode))];
    const claims: WeeklyClaim[] = [];
    if (evaluations.length)
      claims.push({
        code: 'WEEKLY_PRACTICE',
        textVi: `Bạn đã hoàn thành ${evaluations.length} lượt đánh giá, trong đó ${accepted.length} lượt đạt yêu cầu.`,
        sourceRefs: evaluations.map((x) => `evaluation:${x.id}`),
      });
    if (positive.length)
      claims.push({
        code: 'POSITIVE_MASTERY_EVIDENCE',
        textVi: `Bạn tạo thêm bằng chứng tích cực cho ${new Set(positive.map((x) => x.grammarPointId)).size} điểm ngữ pháp.`,
        sourceRefs: positive.map((x) => `mastery-event:${x.id}`),
      });
    if (topics.length)
      claims.push({
        code: 'TOPIC_BREADTH',
        textVi: `Bạn đã luyện tập qua ${topics.length} chủ đề: ${topics.join(', ')}.`,
        sourceRefs: evaluations.map((x) => `evaluation:${x.id}`),
      });
    if (!claims.length)
      claims.push({
        code: 'NO_ACTIVITY',
        textVi: 'Tuần này chưa có lượt học được ghi nhận. Hãy bắt đầu bằng một phiên ngắn.',
        sourceRefs: [`interval:${start.toISOString()}/${end.toISOString()}`],
      });
    const activeError = errors.find((error) => error.state !== 'RESOLVED');
    const nextFocus = activeError
      ? {
          reasonCode: 'ACTIVE_ERROR_PATTERN',
          textVi: `Ưu tiên ôn lại: ${activeError.grammarPoint.versions[0]?.title ?? 'điểm ngữ pháp đang yếu'}.`,
          sourceRefs: [`error-pattern:${activeError.id}`],
        }
      : {
          reasonCode: 'CONTINUE_CURRICULUM',
          textVi: 'Tiếp tục bài kế tiếp trong lộ trình hiện tại.',
          sourceRefs: ['curriculum:current-enrollment'],
        };
    const view: WeeklyReflectionView = {
      policyVersion: growthPolicyVersion,
      weekStart: start.toISOString().slice(0, 10),
      weekEnd: end.toISOString().slice(0, 10),
      claims,
      nextFocus,
    };
    const factsJson = view as unknown as Prisma.InputJsonValue;
    await this.prisma.weeklyProgressReport.upsert({
      where: { userId_weekStart: { userId, weekStart: start } },
      create: {
        userId,
        weekStart: start,
        weekEnd: end,
        policyVersion: growthPolicyVersion,
        factsJson,
        presentationVi: claims.map((x) => x.textVi).join(' '),
      },
      update: {
        weekEnd: end,
        policyVersion: growthPolicyVersion,
        factsJson,
        presentationVi: claims.map((x) => x.textVi).join(' '),
        generatedAt: new Date(),
      },
    });
    return view;
  }
}
