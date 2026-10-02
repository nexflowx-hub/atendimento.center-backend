import type {
  ToolRisk,
  ToolSideEffect,
} from '../actions/action-envelope.types';

export type RuntimeToolContext = {
  organizationId: string | null;
  tenantId: string;
  agentId: string;
  runId: string;
  traceId: string;
};

export type RuntimeToolDefinition = {
  code: string;
  version: string;
  description: string;
  capability: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;

  sideEffect: ToolSideEffect;
  defaultRisk: ToolRisk;
  timeoutMs: number;
};

export interface RuntimeTool {
  readonly definition: RuntimeToolDefinition;

  validate(input: unknown): Record<string, unknown>;

  execute(
    context: RuntimeToolContext,
    input: Record<string, unknown>,
  ): Promise<unknown>;
}
