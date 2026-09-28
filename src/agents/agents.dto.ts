import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateAgentDto {
  @IsString()
  @MaxLength(80)
  code!: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsIn(['closed_flow', 'hybrid', 'freeform', 'tool_agent'])
  mode?: 'closed_flow' | 'hybrid' | 'freeform' | 'tool_agent';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  model?: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsOptional()
  @IsNumber()
  temperature?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class UpdateAgentDto extends CreateAgentDto {
  @IsOptional()
  declare code: string;

  @IsOptional()
  declare name: string;
}

export class CreateFlowDto {
  @IsString()
  @MaxLength(80)
  code!: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsIn(['native', 'typebot', 'n8n', 'external'])
  engine?: 'native' | 'typebot' | 'n8n' | 'external';

  @IsOptional()
  @IsIn(['closed', 'guided', 'hybrid', 'free'])
  conversationalMode?: 'closed' | 'guided' | 'hybrid' | 'free';

  @IsOptional()
  @IsString()
  @MaxLength(240)
  externalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  status?: string;

  @IsOptional()
  @IsObject()
  definition?: Record<string, unknown>;
}

export class UpdateFlowDto extends CreateFlowDto {
  @IsOptional()
  declare code: string;

  @IsOptional()
  declare name: string;
}
