import {
  IsIn,
  IsObject,
  IsString,
  MaxLength,
} from 'class-validator';

export class GrantRuntimeToolDto {
  @IsString()
  @MaxLength(80)
  agentCode!: string;

  @IsString()
  @MaxLength(160)
  toolCode!: string;
}

export class ExecuteRuntimeToolDto {
  @IsString()
  @MaxLength(160)
  toolCode!: string;

  @IsObject()
  input!: Record<string, unknown>;
}


export class UpdateRuntimeToolGrantDto {
  @IsIn(['active', 'disabled', 'revoked'])
  status!: 'active' | 'disabled' | 'revoked';
}
