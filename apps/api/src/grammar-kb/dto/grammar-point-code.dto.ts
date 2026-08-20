import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class GrammarPointCodeDto {
  @ApiProperty({ example: 'BE_PRESENT_AFFIRMATIVE' })
  @Matches(/^[A-Z][A-Z0-9_]+$/)
  code!: string;
}
