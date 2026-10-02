import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type { ModelProvider } from '../model-provider.interface';
import type {
  ModelCapability,
  ModelMessage,
  ModelToolCall,
  ModelToolDefinition,
  ProviderModelRequest,
  ProviderModelResponse,
} from '../model.types';

type OpenRouterToolCall = {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};

type OpenRouterCompletionResponse = {
  model?: string;
  provider?: string;
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | null;
      tool_calls?: OpenRouterToolCall[];
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number | string | null;
  };
};

@Injectable()
export class OpenRouterProvider implements ModelProvider {
  readonly id = 'openrouter';

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  supports(capability: ModelCapability): boolean {
    return capability === 'text' || capability === 'tools';
  }

  async generate(
    request: ProviderModelRequest,
  ): Promise<ProviderModelResponse> {
    const apiKey = this.config.get<string>('OPENROUTER_API_KEY');
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }

    const model =
      request.model ??
      this.config.get<string>('OPENROUTER_MODEL') ??
      'openai/gpt-4.1-mini';

    const wireTools = this.buildWireTools(request.tools ?? []);

    const started = Date.now();
    const response = await firstValueFrom(
      this.http.post<OpenRouterCompletionResponse>(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model,
          messages: request.messages.map((message) =>
            this.toWireMessage(message, wireTools.codeToWire),
          ),
          temperature: request.temperature ?? 0.2,
          ...(request.maxTokens
            ? { max_tokens: request.maxTokens }
            : {}),
          ...(wireTools.tools.length
            ? {
                tools: wireTools.tools,
                tool_choice: request.toolChoice ?? 'auto',
                parallel_tool_calls: false,
              }
            : {}),
        },
        {
          headers: {
            Authorization: 'Bearer ' + apiKey,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://atendimento.center',
            'X-Title': 'Atlas Intelligence Runtime',
          },
        },
      ),
    );

    const message = response.data.choices?.[0]?.message;
    const toolCalls = this.parseToolCalls(
      message?.tool_calls ?? [],
      wireTools.wireToCode,
    );

    const usage = response.data.usage ?? {};
    const inputTokens = Number(usage.prompt_tokens ?? 0);
    const outputTokens = Number(usage.completion_tokens ?? 0);
    const rawCost = usage.cost;
    const parsedCost =
      rawCost === null || rawCost === undefined
        ? null
        : Number(rawCost);

    return {
      provider: this.id,
      model: response.data.model ?? model,
      content: message?.content ?? '',
      stopReason:
        response.data.choices?.[0]?.finish_reason ?? null,
      toolCalls,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: Number(
          usage.total_tokens ?? inputTokens + outputTokens,
        ),
        costUsd:
          parsedCost !== null && Number.isFinite(parsedCost)
            ? parsedCost
            : null,
      },
      latencyMs: Date.now() - started,
    };
  }

  private buildWireTools(tools: ModelToolDefinition[]) {
    const codeToWire = new Map<string, string>();
    const wireToCode = new Map<string, string>();

    const payload = tools.map((tool) => {
      const wireName = this.wireName(tool.code);

      if (
        wireToCode.has(wireName) &&
        wireToCode.get(wireName) !== tool.code
      ) {
        throw new Error(
          `Tool wire-name collision: ${tool.code}`,
        );
      }

      codeToWire.set(tool.code, wireName);
      wireToCode.set(wireName, tool.code);

      return {
        type: 'function',
        function: {
          name: wireName,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      };
    });

    return {
      tools: payload,
      codeToWire,
      wireToCode,
    };
  }

  private toWireMessage(
    message: ModelMessage,
    codeToWire: Map<string, string>,
  ): Record<string, unknown> {
    if (message.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: message.toolCallId,
        content: message.content,
      };
    }

    if (message.role === 'assistant') {
      return {
        role: 'assistant',
        content: message.content,
        ...(message.toolCalls?.length
          ? {
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: 'function',
                function: {
                  name:
                    codeToWire.get(call.name) ??
                    this.wireName(call.name),
                  arguments: JSON.stringify(call.arguments),
                },
              })),
            }
          : {}),
      };
    }

    return message;
  }

  private parseToolCalls(
    calls: OpenRouterToolCall[],
    wireToCode: Map<string, string>,
  ): ModelToolCall[] {
    return calls.map((call, index) => {
      const wireName = call.function?.name;
      if (!wireName) {
        throw new Error(
          'Provider returned a tool call without a function name.',
        );
      }

      const canonical = wireToCode.get(wireName);
      if (!canonical) {
        throw new Error(
          `Provider returned an unknown tool: ${wireName}`,
        );
      }

      let args: unknown;
      try {
        args = JSON.parse(call.function?.arguments ?? '{}');
      } catch {
        throw new Error(
          `Provider returned invalid JSON arguments for ${canonical}`,
        );
      }

      if (!args || typeof args !== 'object' || Array.isArray(args)) {
        throw new Error(
          `Tool arguments for ${canonical} must be a JSON object.`,
        );
      }

      return {
        id: call.id ?? `tool_call_${index + 1}`,
        name: canonical,
        arguments: args as Record<string, unknown>,
      };
    });
  }

  private wireName(code: string): string {
    return code
      .replace(/[^A-Za-z0-9_-]/g, '__')
      .slice(0, 64);
  }
}
