import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
export class LoginDto {
  @ApiProperty({ example: 'owner' })
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]+$/)
  @MaxLength(64)
  username!: string;
  @ApiProperty({ minLength: 8 }) @IsString() @MinLength(8) @MaxLength(200) password!: string;
}
