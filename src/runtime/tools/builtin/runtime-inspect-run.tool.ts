import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type {
  RuntimeTool,
  RuntimeToolContext,
} from '../tool.types';

@Injectable()
export class RuntimeInspectRunTool implements RuntimeTool {
  readonly definition = {
    code: 'atlas.runtime.inspect_run',
    version: '1',
    description:
      'Read one Atlas Runtime run with its steps and events inside the current tenant.',
    capability: 'runtime.read',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['runId'],
      properties: {
        runId: {
          type: 'string',
          format: 'uuid',
        },
      },
    },
    outputSchema: {
      type: 'object',
    },
    sideEffect: 'none' as const,
    defaultRisk: 'low' as const,
    timeoutMs: 10000,
  };

  constructor(private readonly prisma: PrismaService) {}

  validate(input: unknown): Record<string, unknown> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException('Tool input deve ser um objeto.');
    }

    const runId = (input as Record<string, unknown>).runId;
    if (
      typeof runId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        runId,
      )
    ) {
      throw new BadRequestException('runId inválido.');
    }

    return { runId };
  }

  async execute(
    context: RuntimeToolContext,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const runId = input.runId as string;

    const run = await this.prisma.runtimeRun.findFirst({
      where: {
        id: runId,
        tenantId: context.tenantId,
      },
    });

    if (!run) {
      throw new NotFoundException('Run não encontrado neste tenant.');
    }

    const [steps, events, actions] = await Promise.all([
      this.prisma.runtimeStep.findMany({
        where: { runId },
        orderBy: { ordinal: 'asc' },
      }),
      this.prisma.runtimeEvent.findMany({
        where: { runId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.runtimeAction.findMany({
        where: { runId },
        orderBy: { proposedAt: 'asc' },
      }),
    ]);

    return {
      run,
      steps,
      actions,
      events,
    };
  }
}
