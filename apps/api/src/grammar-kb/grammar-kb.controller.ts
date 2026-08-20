import { Controller, Get, NotFoundException, Param, Version } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GrammarKnowledgeBaseService, type PublishedGrammarPoint } from '@english/grammar-kb';
import { GrammarPointCodeDto } from './dto/grammar-point-code.dto';

@ApiTags('grammar-knowledge-base')
@Controller('grammar-points')
export class GrammarKnowledgeBaseController {
  constructor(private readonly service: GrammarKnowledgeBaseService) {}

  @Get(':code')
  @Version('1')
  @ApiOperation({ summary: 'Get the latest published version of a grammar point' })
  @ApiOkResponse({ description: 'Published grammar point' })
  @ApiNotFoundResponse({ description: 'No published grammar point exists for this code' })
  async getPublished(@Param() params: GrammarPointCodeDto): Promise<PublishedGrammarPoint> {
    const result = await this.service.getPublished(params.code);
    if (!result) throw new NotFoundException('Published grammar point not found');
    return result;
  }
}
