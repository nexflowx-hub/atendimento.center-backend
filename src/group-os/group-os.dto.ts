import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MaxLength(80)
  code!: string;

  @IsString()
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsUUID()
  businessUnitId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  objective?: string;

  @IsOptional()
  @IsArray()
  successCriteria?: unknown[];

  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'critical'])
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateGoalDto {
  @IsString()
  @MaxLength(240)
  title!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  parentGoalId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsArray()
  successCriteria?: unknown[];

  @IsOptional()
  @IsISO8601()
  targetAt?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateTaskDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  goalId?: string;

  @IsOptional()
  @IsUUID()
  parentTaskId?: string;

  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'critical'])
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';

  @IsOptional()
  @IsBoolean()
  approvalRequired?: boolean;

  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateTaskStatusDto {
  @IsIn([
    'backlog',
    'ready',
    'running',
    'blocked',
    'review',
    'completed',
    'cancelled',
  ])
  status!:
    | 'backlog'
    | 'ready'
    | 'running'
    | 'blocked'
    | 'review'
    | 'completed'
    | 'cancelled';
}

export class CreateDecisionDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  taskId?: string;

  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  proposal?: string;

  @IsOptional()
  @IsArray()
  alternatives?: unknown[];

  @IsOptional()
  @IsArray()
  risks?: unknown[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
