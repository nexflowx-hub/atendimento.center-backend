import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class DecideApprovalDto {
  @IsIn(['approved', 'denied'])
  decision!: 'approved' | 'denied';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
