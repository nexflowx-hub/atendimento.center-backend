import { Injectable } from '@nestjs/common';
import {
  IntegrationCredentialType,
  IntegrationOutboundAuthMode,
  Prisma,
  ToolCallStatus,
} from '@prisma/client';
import { createHash, createHmac, randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { IntegrationRegistryService } from './integration-registry.service';

@Injectable()
export class IntegrationToolService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationRegistryService,
  ) {}

  async execute(input: {
    runId: string;
    toolKey: string;
    userId: string;
    signal?: AbortSignal;
  }): Promise<{ payload: unknown; toolCallId: string }> {
    const tool = await this.prisma.toolRegistry.findUnique({
      where: { key: input.toolKey },
      include: { integrationApplication: true },
    });

    if (!tool?.enabled) throw new Error('TOOL_NOT_AVAILABLE');
    if (!tool.integrationApplication) {
      throw new Error('TOOL_INTEGRATION_NOT_CONFIGURED');
    }

    const application = await this.integrations.getApplication(
      tool.integrationApplication.key,
    );
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
      const payload = await this.callIntegration({
        application,
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
          status: this.isAbort(error)
            ? ToolCallStatus.cancelled
            : ToolCallStatus.failed,
          errorCode: this.isAbort(error) ? 'RUN_CANCELLED' : 'TOOL_FAILED',
          errorMessage: message,
          durationMs: Date.now() - started,
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  private async callIntegration(input: {
    application: {
      id: string;
      key: string;
      baseUrl: string | null;
      protocol: string;
      outboundAuthMode: IntegrationOutboundAuthMode;
      metadata: Prisma.JsonValue | null;
    };
    method: 'GET' | 'POST';
    pathname: string;
    scopes: string[];
    userId: string;
    requestId: string;
    signal?: AbortSignal;
  }): Promise<unknown> {
    if (!input.application.baseUrl) {
      throw new Error('INTEGRATION_BASE_URL_MISSING');
    }

    if (input.application.protocol === 'mytrainx_hmac_v1') {
      return this.callMyTrainXV1(input);
    }

    if (input.application.outboundAuthMode === IntegrationOutboundAuthMode.none) {
      return this.callJson({
        url: `${input.application.baseUrl.replace(/\/$/, '')}${input.pathname}`,
        method: input.method,
        headers: { Accept: 'application/json' },
        signal: input.signal,
        timeoutMs: this.timeoutMs(input.application.metadata),
      });
    }

    throw new Error(
      `INTEGRATION_PROTOCOL_NOT_SUPPORTED:${input.application.protocol}`,
    );
  }

  private async callMyTrainXV1(input: {
    application: {
      id: string;
      baseUrl: string | null;
      metadata: Prisma.JsonValue | null;
    };
    method: 'GET' | 'POST';
    pathname: string;
    scopes: string[];
    userId: string;
    requestId: string;
    signal?: AbortSignal;
  }): Promise<unknown> {
    const secret = await this.integrations.getCredential(
      input.application.id,
      IntegrationCredentialType.outbound_hmac,
    );

    const metadata = this.metadata(input.application.metadata);
    const service =
      typeof metadata.outboundService === 'string'
        ? metadata.outboundService
        : 'atendimento-center';

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

    const signature = createHmac('sha256', secret)
      .update(canonical)
      .digest('hex');

    return this.callJson({
      url: `${input.application.baseUrl!.replace(/\/$/, '')}${input.pathname}`,
      method: input.method,
      signal: input.signal,
      timeoutMs: this.timeoutMs(input.application.metadata),
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
  }

  private async callJson(input: {
    url: string;
    method: 'GET' | 'POST';
    headers: Record<string, string>;
    signal?: AbortSignal;
    timeoutMs: number;
  }): Promise<unknown> {
    const timeoutSignal = AbortSignal.timeout(input.timeoutMs);
    const signal = input.signal
      ? AbortSignal.any([input.signal, timeoutSignal])
      : timeoutSignal;

    const response = await fetch(input.url, {
      method: input.method,
      signal,
      headers: input.headers,
    });

    const text = await response.text();
    const payload = text ? (JSON.parse(text) as unknown) : null;

    if (!response.ok) {
      throw new Error(`INTEGRATION_HTTP_${response.status}`);
    }

    return payload;
  }

  private timeoutMs(value: Prisma.JsonValue | null): number {
    const metadata = this.metadata(value);
    const timeout = metadata.timeoutMs;
    return typeof timeout === 'number' && timeout >= 1000 && timeout <= 60000
      ? timeout
      : 12000;
  }

  private metadata(value: Prisma.JsonValue | null): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object') return {};
    return value as Record<string, unknown>;
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
    const scopes = value.filter(
      (item): item is string => typeof item === 'string' && item.length > 0,
    );
    if (!scopes.length) throw new Error('TOOL_SCOPE_CONFIG_INVALID');
    return scopes;
  }

  private isAbort(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
  }
}
