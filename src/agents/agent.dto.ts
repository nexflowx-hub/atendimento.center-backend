import { IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAgentConversationDto {
  @IsOptional()
  @IsIn(['web', 'whatsapp', 'instagram', 'facebook', 'api'])
  channel?: 'web' | 'whatsapp' | 'instagram' | 'facebook' | 'api' = 'web';

  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}

export class SendAgentMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  message!: string;
}
