import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class ListConversationsQuery {
  @IsOptional()
  @IsIn(['all', 'open', 'resolved', 'pending', 'snoozed'])
  status?: 'all' | 'open' | 'resolved' | 'pending' | 'snoozed' = 'open';

  @IsOptional()
  @IsIn(['me', 'unassigned', 'all', 'assigned'])
  assigneeType?: 'me' | 'unassigned' | 'all' | 'assigned' = 'all';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;
}

export class SendMessageDto {
  @IsString()
  @MaxLength(10000)
  content!: string;
}

export class UpdateConversationStatusDto {
  @IsIn(['open', 'resolved', 'pending', 'snoozed'])
  status!: 'open' | 'resolved' | 'pending' | 'snoozed';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  snoozedUntil?: number;
}
