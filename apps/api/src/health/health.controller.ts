import { Controller, Get, Version } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService, type HealthResponse } from './health.service';
import { Public } from '../identity/public.decorator';

@ApiTags('system')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Public()
  @Version('1')
  @ApiOperation({ summary: 'Check API process health' })
  @ApiOkResponse({ description: 'The API process is ready to receive requests.' })
  getHealth(): HealthResponse {
    return this.healthService.getHealth();
  }
}
