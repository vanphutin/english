import { IsDateString } from 'class-validator';

export class MarkRestDayDto {
  @IsDateString({ strict: true })
  date!: string;
}
