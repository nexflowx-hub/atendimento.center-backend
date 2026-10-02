import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class StartRuntimeRunDto {
  @IsString()
  @MaxLength(80)
  agentCode!: string;

  @IsString()
  @MaxLength(20000)
  input!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  model?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
