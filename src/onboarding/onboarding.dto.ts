import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateWorkspaceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  organizationName!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  workspaceName?: string;

  @IsOptional()
  @IsIn(['growth', 'engage', 'signals'])
  product?: 'growth' | 'engage' | 'signals';
}
