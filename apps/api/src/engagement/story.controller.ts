import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Version,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StoryService, type StoryJourneyView } from '@english/engagement';
import { PracticeService, type SessionView } from '@english/practice';
import type { AuthenticatedRequest } from '../identity/session-auth.guard';
import { StoryChoiceDto } from './story-choice.dto';

@ApiTags('story')
@Controller('me/story')
export class StoryController {
  constructor(
    private readonly story: StoryService,
    private readonly practice: PracticeService,
  ) {}

  @Get()
  @Version('1')
  @ApiOperation({ summary: 'Get or start the owner A1 story journey' })
  @ApiOkResponse({ description: 'Current versioned scene and bounded story memory' })
  async get(@Req() request: AuthenticatedRequest): Promise<StoryJourneyView> {
    const journey = await this.story.getJourney(request.user!.id);
    if (!journey) throw new NotFoundException('No published story journey is available');
    return journey;
  }

  @Post('scenes/:sceneId/choices')
  @Version('1')
  @ApiOperation({ summary: 'Idempotently record one allowed branch choice' })
  async choose(
    @Req() request: AuthenticatedRequest,
    @Param('sceneId', new ParseUUIDPipe({ version: '4' })) sceneId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: StoryChoiceDto,
  ): Promise<StoryJourneyView> {
    try {
      const journey = await this.story.chooseBranch(
        request.user!.id,
        sceneId,
        body.choiceId,
        this.requireKey(key),
      );
      if (!journey) throw new NotFoundException('Story journey not found');
      return journey;
    } catch (error: unknown) {
      this.rethrowStoryConflict(error);
      throw error;
    }
  }

  @Post('scenes/:sceneId/continue')
  @Version('1')
  @ApiOperation({ summary: 'Continue or finish a linear story scene idempotently' })
  async continue(
    @Req() request: AuthenticatedRequest,
    @Param('sceneId', new ParseUUIDPipe({ version: '4' })) sceneId: string,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<StoryJourneyView> {
    try {
      const journey = await this.story.continueScene(
        request.user!.id,
        sceneId,
        this.requireKey(key),
      );
      if (!journey) throw new NotFoundException('Story journey not found');
      return journey;
    } catch (error: unknown) {
      this.rethrowStoryConflict(error);
      throw error;
    }
  }

  @Post('scenes/:sceneId/practice')
  @Version('1')
  @ApiOperation({ summary: 'Start the exact pinned learning action for the current scene' })
  @ApiCreatedResponse({ description: 'Story-linked practice session' })
  async practiceScene(
    @Req() request: AuthenticatedRequest,
    @Param('sceneId', new ParseUUIDPipe({ version: '4' })) sceneId: string,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<SessionView> {
    const exerciseId = await this.story.getSceneExercise(request.user!.id, sceneId);
    if (!exerciseId) throw new NotFoundException('Current story scene has no learning action');
    return this.practice.startSession(request.user!.id, this.requireKey(key), {
      mode: 'FOCUSED',
      exerciseIds: [exerciseId],
      targetMinutes: 2,
    });
  }

  private requireKey(key: string | undefined): string {
    if (!key || key.length < 8 || key.length > 128)
      throw new BadRequestException('Idempotency-Key must contain 8 to 128 characters');
    return key;
  }

  private rethrowStoryConflict(error: unknown): void {
    if (!(error instanceof Error)) return;
    if (error.message === 'STORY_CHOICE_NOT_FOUND')
      throw new NotFoundException('Story choice not found');
    if (error.message === 'STORY_SCENE_NOT_CURRENT')
      throw new ConflictException('Story scene is no longer current');
    if (error.message === 'STORY_CHOICE_REQUIRED')
      throw new ConflictException('Choose one of the available story branches');
    if (error.message === 'IDEMPOTENCY_KEY_REUSED')
      throw new ConflictException('Idempotency key was reused with another choice');
  }
}
