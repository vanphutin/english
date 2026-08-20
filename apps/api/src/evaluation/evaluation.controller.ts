import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnprocessableEntityException,
  Version,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { EvaluationService, type AttemptView } from '@english/evaluation';
import type { AuthenticatedRequest } from '../identity/session-auth.guard';
import { SubmitAttemptDto } from './submit-attempt.dto';

@ApiTags('attempts')
@Controller()
export class EvaluationController {
  constructor(private readonly service: EvaluationService) {}

  @Post('session-items/:itemId/attempts')
  @Version('1')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Submit an immutable learner attempt for evaluation' })
  @ApiAcceptedResponse({ description: 'Attempt accepted and evaluation state returned' })
  @ApiConflictResponse({ description: 'Idempotency key conflict' })
  async submit(
    @Req() request: AuthenticatedRequest,
    @Param('itemId', new ParseUUIDPipe({ version: '4' })) itemId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: SubmitAttemptDto,
  ): Promise<AttemptView> {
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128)
      throw new BadRequestException('Idempotency-Key must contain 8 to 128 characters');
    try {
      return await this.service.submit(request.user!.id, itemId, idempotencyKey, body);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'IDEMPOTENCY_KEY_REUSED')
        throw new ConflictException('Idempotency key was already used with another request');
      if (error instanceof Error && error.message === 'ATTEMPT_LIMIT_REACHED')
        throw new UnprocessableEntityException('Attempt limit reached');
      if (error instanceof Error && error.message === 'SESSION_ITEM_NOT_FOUND')
        throw new NotFoundException('Session item not found or not available');
      throw error;
    }
  }

  @Get('attempts/:attemptId')
  @Version('1')
  @ApiOperation({ summary: 'Get an owned attempt and its effective evaluation' })
  @ApiOkResponse({ description: 'Attempt state' })
  async get(
    @Req() request: AuthenticatedRequest,
    @Param('attemptId', new ParseUUIDPipe({ version: '4' })) attemptId: string,
  ): Promise<AttemptView> {
    const attempt = await this.service.get(request.user!.id, attemptId);
    if (!attempt) throw new NotFoundException('Attempt not found');
    return attempt;
  }
}
