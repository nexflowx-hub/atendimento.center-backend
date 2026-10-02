import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class ExecutiveDelegationDto {
  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsUUID()
  goalId?: string;

  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(['team', 'agent'])
  assigneeType!: 'team' | 'agent';

  @IsUUID()
  assigneeId!: string;

  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'critical'])
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';

  @IsOptional()
  @IsBoolean()
  approvalRequired?: boolean;
}
