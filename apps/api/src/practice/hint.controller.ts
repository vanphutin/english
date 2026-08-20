import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Version,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PracticeService, type VocabularyHintView } from '@english/practice';
import type { AuthenticatedRequest } from '../identity/session-auth.guard';

@ApiTags('vocabulary-assistant')
@Controller('session-items/:itemId/hints')
export class HintController {
  constructor(private readonly service: PracticeService) {}

  @Get()
  @Version('1')
  @ApiOperation({ summary: 'List previously revealed vocabulary hints for an owned item' })
  @ApiOkResponse({ description: 'Stable reveal history ordered by hint level' })
  list(
    @Req() request: AuthenticatedRequest,
    @Param('itemId', new ParseUUIDPipe({ version: '4' })) itemId: string,
  ): Promise<VocabularyHintView[]> {
    return this.service.listRevealedHints(request.user!.id, itemId);
  }

  @Post('next')
  @Version('1')
  @ApiOperation({ summary: 'Reveal the next safe progressive vocabulary hint' })
  @ApiOkResponse({ description: 'Newly revealed hint' })
  async revealNext(
    @Req() request: AuthenticatedRequest,
    @Param('itemId', new ParseUUIDPipe({ version: '4' })) itemId: string,
  ): Promise<VocabularyHintView> {
    try {
      const hint = await this.service.revealNextHint(request.user!.id, itemId);
      if (!hint) throw new NotFoundException('No more vocabulary hints are available');
      return hint;
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'SESSION_ITEM_NOT_FOUND')
        throw new NotFoundException('Session item not found');
      throw error;
    }
  }
}
