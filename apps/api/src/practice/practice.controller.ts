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
  Body,
  Req,
  ServiceUnavailableException,
  Version,
} from '@nestjs/common';
import { ApiConflictResponse, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PracticeService,
  type ExerciseView,
  type SessionStateView,
  type SessionSummaryView,
  type SessionView,
} from '@english/practice';
import type { AuthenticatedRequest } from '../identity/session-auth.guard';
import { StartSessionDto } from './start-session.dto';

@ApiTags('sessions')
@Controller('sessions')
export class PracticeController {
  constructor(private readonly service: PracticeService) {}

  @Post()
  @Version('1')
  @ApiOperation({ summary: 'Start an idempotent learning session' })
  @ApiCreatedResponse({ description: 'Session created or replayed safely' })
  @ApiConflictResponse({ description: 'Idempotency key was reused with another payload' })
  async start(
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: StartSessionDto,
  ): Promise<SessionView> {
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128)
      throw new BadRequestException('Idempotency-Key must contain 8 to 128 characters');
    try {
      return await this.service.startSession(request.user!.id, idempotencyKey, body);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'IDEMPOTENCY_KEY_REUSED')
        throw new ConflictException('Idempotency key was already used with another request');
      if (error instanceof Error && error.message === 'ACTIVE_CURRICULUM_NOT_FOUND')
        throw new ServiceUnavailableException('No active curriculum is available');
      if (error instanceof Error && error.message === 'NO_PUBLISHED_EXERCISES')
        throw new ServiceUnavailableException('No published exercises match this session');
      throw error;
    }
  }

  @Get(':sessionId/next')
  @Version('1')
  @ApiOperation({ summary: 'Get the next safe exercise presentation' })
  async next(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ): Promise<ExerciseView> {
    const exercise = await this.service.getNext(request.user!.id, sessionId);
    if (!exercise) throw new NotFoundException('No pending exercise was found');
    return exercise;
  }

  @Get(':sessionId')
  @Version('1')
  @ApiOperation({ summary: 'Resume an owned learning session' })
  async getSession(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ): Promise<SessionStateView> {
    const session = await this.service.getSession(request.user!.id, sessionId);
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  @Post(':sessionId/complete')
  @Version('1')
  @ApiOperation({ summary: 'Complete a fully answered learning session idempotently' })
  async complete(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<SessionSummaryView> {
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128)
      throw new BadRequestException('Idempotency-Key must contain 8 to 128 characters');
    try {
      return await this.service.completeSession(request.user!.id, sessionId, idempotencyKey);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'IDEMPOTENCY_KEY_REUSED')
        throw new ConflictException('Idempotency key was already used for another session');
      if (error instanceof Error && error.message === 'SESSION_NOT_READY')
        throw new ConflictException('Complete every session item before finishing the session');
      if (error instanceof Error && error.message === 'SESSION_NOT_FOUND')
        throw new NotFoundException('Session not found');
      throw error;
    }
  }
}
