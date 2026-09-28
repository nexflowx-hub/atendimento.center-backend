import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class RelationshipRespondDto {
  @IsString()
  @MaxLength(80)
  agentCode!: string;

  @IsUUID()
  contactId!: string;

  @IsString()
  @MaxLength(12000)
  currentMessage!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  eventId?: string;

  @IsOptional()
  @IsUUID()
  conversationRefId?: string;

  @IsOptional()
  @IsArray()
  recentConversation?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;

  @IsOptional()
  @IsObject()
  runtime?: Record<string, unknown>;
}
