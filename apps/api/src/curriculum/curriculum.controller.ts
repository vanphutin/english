import { Controller, Get, NotFoundException, Version } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurriculumService, type CurriculumView } from '@english/curriculum';

@ApiTags('curriculum')
@Controller('curriculum')
export class CurriculumController {
  constructor(private readonly service: CurriculumService) {}

  @Get()
  @Version('1')
  @ApiOperation({ summary: 'Get the active published curriculum release' })
  @ApiOkResponse({ description: 'Active immutable curriculum graph' })
  @ApiNotFoundResponse({ description: 'No published curriculum exists' })
  async getActive(): Promise<CurriculumView> {
    const curriculum = await this.service.getActive();
    if (!curriculum) throw new NotFoundException('Published curriculum not found');
    return curriculum;
  }
}
