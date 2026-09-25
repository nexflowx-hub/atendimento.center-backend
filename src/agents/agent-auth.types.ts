import type { Request } from 'express';

export interface AgentPrincipal {
  service: string;
  userId: string;
  scopes: Set<string>;
  requestId: string;
  productKey: string;
}

export interface AgentGatewayRequest extends Request {
  agentPrincipal?: AgentPrincipal;
}
