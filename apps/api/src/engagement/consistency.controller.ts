import { BadRequestException, Body, Controller, Get, Post, Req, Version } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConsistencyService } from '@english/engagement';
import type { AuthenticatedRequest } from '../identity/session-auth.guard';
import { MarkRestDayDto } from './dto/mark-rest-day.dto';

@ApiTags('engagement')
@Controller('me')
export class ConsistencyController {
  constructor(private readonly consistency: ConsistencyService) {}

  @Get('consistency-calendar')
  @Version('1')
  @ApiOperation({ summary: 'Get the 28-day meaningful learning calendar' })
  @ApiOkResponse({ description: 'Learning/rest days and non-punitive rhythm summary' })
  getCalendar(@Req() request: AuthenticatedRequest) {
    return this.consistency.getCalendar(request.user!.id);
  }

  @Post('consistency-calendar/rest-days')
  @Version('1')
  @ApiOperation({ summary: 'Mark an optional rest day without overwriting learning evidence' })
  @ApiCreatedResponse({ description: 'Updated calendar' })
  async markRestDay(@Req() request: AuthenticatedRequest, @Body() body: MarkRestDayDto) {
    try {
      return await this.consistency.markRestDay(request.user!.id, body.date);
    } catch (error) {
      if (error instanceof Error && error.message === 'INVALID_REST_DATE')
        throw new BadRequestException('Rest date must be within the allowed window');
      throw error;
    }
  }

  @Get('daily-surprise')
  @Version('1')
  @ApiOperation({ summary: 'Get the deterministic optional surprise for today' })
  @ApiOkResponse({ description: 'Published level-appropriate optional content' })
  getDailySurprise(@Req() request: AuthenticatedRequest) {
    return this.consistency.getDailySurprise(request.user!.id);
  }
}
