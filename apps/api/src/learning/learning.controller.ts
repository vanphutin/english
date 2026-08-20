import { Controller, Get, Query, Req, Version } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LearningService, type MasteryView, type ProgressView } from '@english/learning';
import type { AuthenticatedRequest } from '../identity/session-auth.guard';
import { MasteryQueryDto } from './mastery-query.dto';

@ApiTags('learning')
@Controller('me')
export class LearningController {
  constructor(private readonly service: LearningService) {}

  @Get('progress')
  @Version('1')
  @ApiOperation({ summary: 'Get the learner curriculum progress and recommended next action' })
  @ApiOkResponse({ description: 'Current level progress, or null before curriculum enrollment' })
  progress(@Req() request: AuthenticatedRequest): Promise<ProgressView | null> {
    return this.service.getProgress(request.user!.id);
  }

  @Get('mastery')
  @Version('1')
  @ApiOperation({ summary: 'List learner mastery projections' })
  @ApiOkResponse({ description: 'Bounded mastery projection list' })
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: MasteryQueryDto,
  ): Promise<MasteryView[]> {
    return this.service.listMastery(
      request.user!.id,
      query.dueBefore ? new Date(query.dueBefore) : undefined,
    );
  }
}
