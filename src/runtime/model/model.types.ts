export type ModelCapability =
  | 'text'
  | 'stream'
  | 'structured_output'
  | 'tools'
  | 'embeddings';

export type ModelToolDefinition = {
  code: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type ModelToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type ModelMessage =
  | {
      role: 'system' | 'user';
      content: string;
    }
  | {
      role: 'assistant';
      content: string | null;
      toolCalls?: ModelToolCall[];
    }
  | {
      role: 'tool';
      toolCallId: string;
      content: string;
    };

export type ModelUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number | null;
};

export type ModelRequest = {
  provider?: string;
  model?: string;
  messages: ModelMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: ModelToolDefinition[];
  toolChoice?: 'auto' | 'none';
  metadata?: Record<string, unknown>;
};

export type ModelResponse = {
  provider: string;
  model: string;
  content: string;
  stopReason: string | null;
  toolCalls: ModelToolCall[];
  usage: ModelUsage;
  latencyMs: number;
};

export type ProviderModelRequest = Omit<ModelRequest, 'provider'>;
export type ProviderModelResponse = ModelResponse;
