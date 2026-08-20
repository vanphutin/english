import { Controller, Get, Req, Version } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PracticeService, type DailyChoiceView } from '@english/practice';
import type { AuthenticatedRequest } from '../identity/session-auth.guard';

@ApiTags('sessions')
@Controller('me/daily-choices')
export class DailyChoicesController {
  constructor(private readonly service: PracticeService) {}

  @Get()
  @Version('1')
  @ApiOperation({ summary: 'Get server-owned daily learning choices' })
  @ApiOkResponse({ description: 'Up to three policy-owned learning choices' })
  getDailyChoices(@Req() request: AuthenticatedRequest): Promise<DailyChoiceView[]> {
    return this.service.getDailyChoices(request.user!.id);
  }
}
