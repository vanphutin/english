import { BadRequestException, Body, Controller, Get, Put, Req, Version } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GrowthService } from '@english/engagement';
import type { AuthenticatedRequest } from '../identity/session-auth.guard';
import { UpdateInterestsDto } from './dto/update-interests.dto';

@ApiTags('engagement')
@Controller('me')
export class GrowthController {
  constructor(private readonly growth: GrowthService) {}

  @Get('interests')
  @Version('1')
  @ApiOperation({ summary: 'Get approved and selected learning topics' })
  @ApiOkResponse({ description: 'Ordered topic preferences' })
  getInterests(@Req() request: AuthenticatedRequest) {
    return this.growth.getInterests(request.user!.id);
  }

  @Put('interests')
  @Version('1')
  @ApiOperation({ summary: 'Replace ordered topic preferences' })
  @ApiOkResponse({ description: 'Updated topic preferences' })
  async updateInterests(@Req() request: AuthenticatedRequest, @Body() body: UpdateInterestsDto) {
    try {
      return await this.growth.updateInterests(request.user!.id, body.topicCodes);
    } catch (error) {
      if (error instanceof Error && error.message === 'INVALID_INTEREST_TOPICS')
        throw new BadRequestException('Unknown, duplicate, or excessive topic codes');
      throw error;
    }
  }

  @Get('achievements')
  @Version('1')
  @ApiOperation({ summary: 'Derive and list meaningful achievements' })
  @ApiOkResponse({ description: 'Granted and locked achievement definitions' })
  getAchievements(@Req() request: AuthenticatedRequest) {
    return this.growth.getAchievements(request.user!.id);
  }

  @Get('weekly-reflections')
  @Version('1')
  @ApiOperation({ summary: 'Generate a fact-grounded current-week reflection' })
  @ApiOkResponse({ description: 'Traceable weekly learning claims and next focus' })
  getWeeklyReflection(@Req() request: AuthenticatedRequest) {
    return this.growth.getWeeklyReflection(request.user!.id);
  }
}
