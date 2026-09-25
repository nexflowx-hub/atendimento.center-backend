import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ModelToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ModelToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type ModelMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }
  | { role: 'tool'; tool_call_id: string; name: string; content: string };

export interface ModelPlan {
  content: string | null;
  toolCalls: ModelToolCall[];
  rawAssistant: Extract<ModelMessage, { role: 'assistant' }>;
}

@Injectable()
export class ModelGatewayService {
  constructor(private readonly config: ConfigService) {}

  async plan(input: {
    provider: string;
    model: string;
    temperature: number;
    messages: ModelMessage[];
    tools: ModelToolDefinition[];
    signal?: AbortSignal;
  }): Promise<ModelPlan> {
    this.ensureProvider(input.provider);
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: input.signal,
      headers: this.headers(),
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        tools: input.tools,
        tool_choice: input.tools.length ? 'auto' : undefined,
        temperature: input.temperature,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`MODEL_PLAN_FAILED:${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            type: 'function';
            function: { name: string; arguments: string };
          }>;
        };
      }>;
    };

    const message = payload.choices?.[0]?.message;
    if (!message) throw new Error('MODEL_PLAN_EMPTY');

    const rawAssistant: Extract<ModelMessage, { role: 'assistant' }> = {
      role: 'assistant',
      content: message.content ?? null,
      tool_calls: message.tool_calls,
    };

    return {
      content: message.content ?? null,
      rawAssistant,
      toolCalls: (message.tool_calls ?? []).map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: this.parseArguments(call.function.arguments),
      })),
    };
  }

  async *stream(input: {
    provider: string;
    model: string;
    temperature: number;
    messages: ModelMessage[];
    tools?: ModelToolDefinition[];
    signal?: AbortSignal;
  }): AsyncGenerator<{ delta?: string; usage?: Record<string, number> }> {
    this.ensureProvider(input.provider);
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: input.signal,
      headers: this.headers(),
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        tools: input.tools?.length ? input.tools : undefined,
        tool_choice: input.tools?.length ? 'none' : undefined,
        temperature: input.temperature,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`MODEL_STREAM_FAILED:${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;

        const chunk = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string | null } }>;
          usage?: Record<string, number>;
        };

        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) yield { delta };
        if (chunk.usage) yield { usage: chunk.usage };
      }
    }
  }

  private headers(): Record<string, string> {
    const apiKey = this.config.get<string>('OPENROUTER_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException('OPENROUTER_API_KEY is not configured.');
    }

    return {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'HTTP-Referer': 'https://atendimento.center',
      'X-Title': 'Atendimento.Center Agent Runtime',
    };
  }

  private ensureProvider(provider: string): void {
    if (provider !== 'openrouter') {
      throw new ServiceUnavailableException(`Unsupported model provider: ${provider}`);
    }
  }

  private parseArguments(raw: string): Record<string, unknown> {
    if (!raw.trim()) return {};
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
}
