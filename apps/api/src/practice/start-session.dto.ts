import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import type { SessionMode, StartSessionInput } from '@english/practice';

enum SessionModeValue {
  DAILY = 'DAILY',
  FOCUSED = 'FOCUSED',
  REVIEW = 'REVIEW',
}

export class StartSessionDto implements StartSessionInput {
  @ApiProperty({ enum: SessionModeValue })
  @IsEnum(SessionModeValue)
  mode!: SessionMode;

  @ApiPropertyOptional({ type: [String], format: 'uuid', maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  grammarPointIds?: string[];

  @ApiPropertyOptional({ minimum: 2, maximum: 30, default: 10 })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(30)
  targetMinutes?: number;
}
