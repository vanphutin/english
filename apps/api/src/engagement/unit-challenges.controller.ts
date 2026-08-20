import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  ServiceUnavailableException,
  Version,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  EngagementService,
  type UnitChallengePlan,
  type UnitChallengeView,
} from '@english/engagement';
import { PracticeService, type SessionView } from '@english/practice';
import type { AuthenticatedRequest } from '../identity/session-auth.guard';

@ApiTags('unit-challenges')
@Controller()
export class UnitChallengesController {
  constructor(
    private readonly engagement: EngagementService,
    private readonly practice: PracticeService,
  ) {}

  @Post('curriculum-units/:unitId/challenge')
  @Version('1')
  @ApiOperation({ summary: 'Start an auditable multi-target challenge for a current-level unit' })
  @ApiCreatedResponse({ description: 'Challenge and its learning session' })
  async start(
    @Req() request: AuthenticatedRequest,
    @Param('unitId', new ParseUUIDPipe({ version: '4' })) unitId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<UnitChallengePlan> {
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128)
      throw new BadRequestException('Idempotency-Key must contain 8 to 128 characters');
    const targets = await this.engagement.getUnitTargetPlan(request.user!.id, unitId);
    if (!targets) throw new NotFoundException('Current-level unit not found');
    if (!targets.length) throw new ServiceUnavailableException('Unit has no published targets');
    let session: SessionView;
    try {
      session = await this.practice.startSession(request.user!.id, idempotencyKey, {
        mode: 'FOCUSED',
        grammarPointIds: targets.map((target) => target.id),
        targetMinutes: Math.min(20, Math.max(8, targets.length * 2)),
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'IDEMPOTENCY_KEY_REUSED')
        throw new ConflictException('Idempotency key was reused with another challenge');
      if (error instanceof Error && error.message === 'NO_PUBLISHED_EXERCISES')
        throw new ServiceUnavailableException('Challenge exercises are not available');
      throw error;
    }
    return this.engagement.createUnitChallenge(request.user!.id, unitId, session.id, targets);
  }

  @Get('unit-challenges/:challengeId')
  @Version('1')
  @ApiOperation({ summary: 'Return an owner-only per-target unit challenge result' })
  @ApiOkResponse({ description: 'Auditable result with safe no-evidence outcomes' })
  async get(
    @Req() request: AuthenticatedRequest,
    @Param('challengeId', new ParseUUIDPipe({ version: '4' })) challengeId: string,
  ): Promise<UnitChallengeView> {
    const challenge = await this.engagement.getUnitChallenge(request.user!.id, challengeId);
    if (!challenge) throw new NotFoundException('Unit challenge not found');
    return challenge;
  }

  @Post('unit-challenges/:challengeId/remediation')
  @Version('1')
  @ApiOperation({ summary: 'Start focused remediation for challenge targets needing practice' })
  async remediate(
    @Req() request: AuthenticatedRequest,
    @Param('challengeId', new ParseUUIDPipe({ version: '4' })) challengeId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<SessionView> {
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128)
      throw new BadRequestException('Idempotency-Key must contain 8 to 128 characters');
    const challenge = await this.engagement.getUnitChallenge(request.user!.id, challengeId);
    if (!challenge) throw new NotFoundException('Unit challenge not found');
    if (!challenge.remediationGrammarPointIds.length)
      throw new ConflictException('Challenge has no targets requiring remediation');
    return this.practice.startSession(request.user!.id, idempotencyKey, {
      mode: 'FOCUSED',
      grammarPointIds: challenge.remediationGrammarPointIds,
      targetMinutes: Math.min(16, Math.max(8, challenge.remediationGrammarPointIds.length * 2)),
    });
  }
}
