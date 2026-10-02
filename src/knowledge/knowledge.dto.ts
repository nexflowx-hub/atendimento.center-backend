import {
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class IngestKnowledgeDocumentDto {
  @IsIn([
    'organization',
    'business_unit',
    'branch',
    'project',
    'agent_pack',
  ])
  scopeType!:
    | 'organization'
    | 'business_unit'
    | 'branch'
    | 'project'
    | 'agent_pack';

  @IsOptional()
  @IsUUID()
  scopeId?: string;

  @IsString()
  @MaxLength(80)
  kind!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  externalRef?: string;

  @IsString()
  @MaxLength(300)
  title!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateProjectMemoryDto {
  @IsString()
  @MaxLength(80)
  category!: string;

  @IsString()
  @MaxLength(4000)
  fact!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  importance?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  sourceRef?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
