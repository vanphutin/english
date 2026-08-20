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
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { EngagementService, type ErrorNotebookView } from '@english/engagement';
import { PracticeService, type SessionView } from '@english/practice';
import type { AuthenticatedRequest } from '../identity/session-auth.guard';

@ApiTags('engagement')
@Controller('me/error-notebook')
export class EngagementController {
  constructor(
    private readonly engagement: EngagementService,
    private readonly practice: PracticeService,
  ) {}

  @Get()
  @Version('1')
  @ApiOperation({ summary: 'Rebuild and return the owner error-pattern projection' })
  @ApiOkResponse({ description: 'Current deterministic mistake notebook' })
  getNotebook(@Req() request: AuthenticatedRequest): Promise<ErrorNotebookView> {
    return this.engagement.getErrorNotebook(request.user!.id);
  }

  @Post(':patternId/practice')
  @Version('1')
  @ApiOperation({ summary: 'Start focused remediation for an owned error pattern' })
  @ApiCreatedResponse({ description: 'Focused session created or replayed safely' })
  @ApiConflictResponse({ description: 'Idempotency key was reused with changed intent' })
  async practicePattern(
    @Req() request: AuthenticatedRequest,
    @Param('patternId', new ParseUUIDPipe({ version: '4' })) patternId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<SessionView> {
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128)
      throw new BadRequestException('Idempotency-Key must contain 8 to 128 characters');
    const grammarPointId = await this.engagement.getOwnedPatternTarget(request.user!.id, patternId);
    if (!grammarPointId) throw new NotFoundException('Error pattern not found');
    try {
      return await this.practice.startSession(request.user!.id, idempotencyKey, {
        mode: 'FOCUSED',
        grammarPointIds: [grammarPointId],
        targetMinutes: 8,
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'IDEMPOTENCY_KEY_REUSED')
        throw new ConflictException('Idempotency key was already used with another request');
      if (error instanceof Error && error.message === 'NO_PUBLISHED_EXERCISES')
        throw new ServiceUnavailableException('No remediation exercises are currently available');
      throw error;
    }
  }
}
