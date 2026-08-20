import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class StoryChoiceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  choiceId!: string;
}
