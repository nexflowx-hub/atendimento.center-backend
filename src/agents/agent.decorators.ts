import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AgentGatewayRequest, AgentPrincipal } from './agent-auth.types';

export const CurrentAgentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AgentPrincipal => {
    const request = context.switchToHttp().getRequest<AgentGatewayRequest>();
    if (!request.agentPrincipal) {
      throw new Error('Agent principal missing after authentication.');
    }
    return request.agentPrincipal;
  },
);
