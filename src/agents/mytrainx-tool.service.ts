import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ToolCallStatus } from '@prisma/client';
import { createHash, createHmac, randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class MyTrainXToolService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async execute(input: {
    runId: string;
    toolKey: string;
    userId: string;
    signal?: AbortSignal;
  }): Promise<{ payload: unknown; toolCallId: string }> {
    const tool = await this.prisma.toolRegistry.findUnique({
      where: { key: input.toolKey },
    });

    if (!tool?.enabled) throw new Error('TOOL_NOT_AVAILABLE');

    const scopes = this.parseScopes(tool.scopes);
    const requestId = `tool_${randomUUID()}`;
    const toolCall = await this.prisma.agentToolCall.create({
      data: {
        runId: input.runId,
        toolKey: tool.key,
        requestId,
        status: ToolCallStatus.running,
        input: {} as Prisma.InputJsonObject,
      },
    });

    const started = Date.now();
    try {
      const payload = await this.callMyTrainX({
        method: tool.method as 'GET' | 'POST',
        pathname: tool.endpointPath,
        scopes,
        userId: input.userId,
        requestId,
        signal: input.signal,
      });

      await this.prisma.agentToolCall.update({
        where: { id: toolCall.id },
        data: {
          status: ToolCallStatus.completed,
          output: this.auditOutput(payload),
          durationMs: Date.now() - started,
          completedAt: new Date(),
        },
      });

      return { payload, toolCallId: toolCall.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'TOOL_FAILED';
      await this.prisma.agentToolCall.update({
        where: { id: toolCall.id },
        data: {
          status: this.isAbort(error) ? ToolCallStatus.cancelled : ToolCallStatus.failed,
          errorCode: this.isAbort(error) ? 'RUN_CANCELLED' : 'TOOL_FAILED',
          errorMessage: message,
          durationMs: Date.now() - started,
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  private async callMyTrainX(input: {
    method: 'GET' | 'POST';
    pathname: string;
    scopes: string[];
    userId: string;
    requestId: string;
    signal?: AbortSignal;
  }): Promise<unknown> {
    const secret = this.config.get<string>('MYTRAINX_AGENT_SHARED_SECRET');
    if (!secret) {
      throw new ServiceUnavailableException('MYTRAINX_AGENT_SHARED_SECRET is not configured.');
    }

    const baseUrl =
      (this.config.get<string>('MYTRAINX_BASE_URL') ?? 'https://mytrainx.fit').replace(/\/$/, '');
    const service =
      this.config.get<string>('MYTRAINX_AGENT_SERVICE') ?? 'atendimento-center';
    const timestamp = Math.floor(Date.now() / 1000);
    const sortedScopes = [...input.scopes].sort().join(' ');

    const canonical = [
      input.method,
      input.pathname,
      service,
      input.userId,
      String(timestamp),
      sortedScopes,
      input.requestId,
    ].join('\n');

    const signature = createHmac('sha256', secret).update(canonical).digest('hex');
    const timeoutSignal = AbortSignal.timeout(
      Number(this.config.get<string>('MYTRAINX_TOOL_TIMEOUT_MS') ?? '12000'),
    );
    const signal = input.signal
      ? AbortSignal.any([input.signal, timeoutSignal])
      : timeoutSignal;

    const response = await fetch(`${baseUrl}${input.pathname}`, {
      method: input.method,
      signal,
      headers: {
        Accept: 'application/json',
        'x-mtx-service': service,
        'x-mtx-user-id': input.userId,
        'x-mtx-timestamp': String(timestamp),
        'x-mtx-scope': sortedScopes,
        'x-mtx-request-id': input.requestId,
        'x-mtx-signature': signature,
      },
    });

    const text = await response.text();
    const payload = text ? (JSON.parse(text) as unknown) : null;
    if (!response.ok) {
      throw new Error(`MYTRAINX_TOOL_HTTP_${response.status}`);
    }
    return payload;
  }

  private auditOutput(payload: unknown): Prisma.InputJsonObject {
    const serialized = JSON.stringify(payload);
    return {
      ok: true,
      responseBytes: Buffer.byteLength(serialized, 'utf8'),
      responseSha256: createHash('sha256').update(serialized).digest('hex'),
    };
  }

  private parseScopes(value: Prisma.JsonValue): string[] {
    if (!Array.isArray(value)) throw new Error('TOOL_SCOPE_CONFIG_INVALID');
    const scopes = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
    if (!scopes.length) throw new Error('TOOL_SCOPE_CONFIG_INVALID');
    return scopes;
  }

  private isAbort(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
  }
}
