import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentAgentPrincipal } from './agent.decorators';
import { AgentGatewayAuthGuard } from './agent-auth.guard';
import { AgentHttpExceptionFilter } from './agent-http-exception.filter';
import type { AgentPrincipal } from './agent-auth.types';
import {
  CreateAgentConversationDto,
  SendAgentMessageDto,
} from './agent.dto';
import { AgentRuntimeService } from './agent-runtime.service';

@Controller('agents/:agent')
@UseGuards(AgentGatewayAuthGuard)
@UseFilters(AgentHttpExceptionFilter)
export class AgentsController {
  constructor(private readonly runtime: AgentRuntimeService) {}

  @Post('conversations')
  createConversation(
    @Param('agent') agent: string,
    @CurrentAgentPrincipal() principal: AgentPrincipal,
    @Body() body: CreateAgentConversationDto,
  ) {
    return this.runtime.createConversation(agent, principal, body);
  }

  @Get('conversations')
  listConversations(
    @Param('agent') agent: string,
    @CurrentAgentPrincipal() principal: AgentPrincipal,
  ) {
    return this.runtime.listConversations(agent, principal);
  }

  @Get('conversations/:conversationId')
  getConversation(
    @Param('agent') agent: string,
    @Param('conversationId') conversationId: string,
    @CurrentAgentPrincipal() principal: AgentPrincipal,
  ) {
    return this.runtime.getConversation(agent, conversationId, principal);
  }

  @Post('conversations/:conversationId/messages')
  async sendMessage(
    @Param('agent') agent: string,
    @Param('conversationId') conversationId: string,
    @CurrentAgentPrincipal() principal: AgentPrincipal,
    @Body() body: SendAgentMessageDto,
    @Res() response: Response,
  ): Promise<void> {
    await this.runtime.streamMessage({
      agentKey: agent,
      conversationId,
      principal,
      message: body.message,
      response,
    });
  }

  @Post('conversations/:conversationId/cancel')
  cancel(
    @Param('agent') agent: string,
    @Param('conversationId') conversationId: string,
    @CurrentAgentPrincipal() principal: AgentPrincipal,
  ) {
    return this.runtime.cancelConversation(agent, conversationId, principal);
  }
}
