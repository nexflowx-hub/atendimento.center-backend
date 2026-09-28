import {
  IsArray,
  IsIn,
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


export class CanonicalInboundDto {
  @IsString()
  @MaxLength(240)
  eventId!: string;

  @IsIn(['whatsapp', 'instagram', 'facebook', 'web'])
  channel!: 'whatsapp' | 'instagram' | 'facebook' | 'web';

  @IsString()
  @MaxLength(120)
  channelAccount!: string;

  @IsString()
  @MaxLength(240)
  externalConversationId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  senderExternalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  senderPhoneE164?: string;

  @IsIn(['text', 'audio', 'image', 'video', 'document', 'reaction'])
  messageType!: 'text' | 'audio' | 'image' | 'video' | 'document' | 'reaction';

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  text?: string;

  @IsOptional()
  @IsArray()
  attachments?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

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
