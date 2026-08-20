import { ArrayMaxSize, ArrayUnique, IsArray, IsString } from 'class-validator';

export class UpdateInterestsDto {
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsString({ each: true })
  topicCodes!: string[];
}
