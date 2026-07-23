import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Body,
  Query,
  UseGuards,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Tenant } from '@prisma/client';
import { CurrentTenant } from '../auth/auth.decorators';
import { SupabaseAuthGuard, TenantGuard } from '../auth/auth.guards';
import { ChatwootService } from '../integrations/chatwoot.service';
import {
  ListConversationsQuery,
  SendMessageDto,
  UpdateConversationStatusDto,
} from './conversation.dto';

@Controller('conversations')
@UseGuards(SupabaseAuthGuard, TenantGuard)
export class ConversationsController {
  constructor(private readonly chatwoot: ChatwootService) {}

  @Get()
  list(
    @CurrentTenant() tenant: Tenant,
    @Query() query: ListConversationsQuery,
  ): Promise<unknown> {
    return this.chatwoot.listConversations(this.accountId(tenant), query);
  }

  @Get(':conversationId')
  details(
    @CurrentTenant() tenant: Tenant,
    @Param('conversationId', ParseIntPipe) conversationId: number,
  ): Promise<unknown> {
    return this.chatwoot.getConversation(this.accountId(tenant), conversationId);
  }

  @Post(':conversationId/messages')
  sendMessage(
    @CurrentTenant() tenant: Tenant,
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Body() body: SendMessageDto,
  ): Promise<unknown> {
    return this.chatwoot.sendMessage(this.accountId(tenant), conversationId, body.content);
  }

  @Patch(':conversationId/status')
  updateStatus(
    @CurrentTenant() tenant: Tenant,
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Body() body: UpdateConversationStatusDto,
  ): Promise<unknown> {
    return this.chatwoot.toggleStatus(
      this.accountId(tenant),
      conversationId,
      body.status,
      body.snoozedUntil,
    );
  }

  private accountId(tenant: Tenant): number {
    if (!tenant.chatwootAccountId) {
      throw new ServiceUnavailableException('Tenant sem conta Chatwoot configurada.');
    }

    return tenant.chatwootAccountId;
  }
}
