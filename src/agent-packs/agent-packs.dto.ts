import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateAgentPackDto {
  @IsString()
  @MaxLength(80)
  code!: string;

  @IsString()
  @MaxLength(180)
  name!: string;

  @IsString()
  @MaxLength(120)
  role!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateAgentPackVersionDto {
  @IsString()
  instructions!: string;

  @IsOptional()
  @IsObject()
  modelPolicy?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  capabilityPolicy?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ReviewAgentPackVersionDto {
  @IsIn(['passed', 'failed', 'waived'])
  evaluationStatus!: 'passed' | 'failed' | 'waived';
}

export class AddAgentPackToolDto {
  @IsString()
  @MaxLength(160)
  toolCode!: string;

  @IsOptional()
  @IsObject()
  constraints?: Record<string, unknown>;
}
