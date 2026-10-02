import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type {
  RuntimeTool,
  RuntimeToolContext,
} from '../tool.types';

const TASK_STATUSES = new Set([
  'backlog',
  'ready',
  'running',
  'blocked',
  'review',
  'completed',
  'cancelled',
]);

@Injectable()
export class PortfolioUpdateTaskStatusTool
  implements RuntimeTool
{
  readonly definition = {
    code: 'atlas.portfolio.update_task_status',
    version: '1',
    description:
      'Change the status of one Atlas Group OS task in the current organization.',
    capability: 'portfolio.task.write',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['taskId', 'status'],
      properties: {
        taskId: {
          type: 'string',
          format: 'uuid',
        },
        status: {
          type: 'string',
          enum: Array.from(TASK_STATUSES),
        },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['taskId', 'from', 'to'],
    },
    sideEffect: 'reversible' as const,
    defaultRisk: 'medium' as const,
    timeoutMs: 10000,
  };

  constructor(private readonly prisma: PrismaService) {}

  validate(input: unknown): Record<string, unknown> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException('Tool input deve ser um objeto.');
    }

    const raw = input as Record<string, unknown>;
    const taskId = raw.taskId;
    const status = raw.status;

    if (
      typeof taskId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        taskId,
      )
    ) {
      throw new BadRequestException('taskId inválido.');
    }

    if (typeof status !== 'string' || !TASK_STATUSES.has(status)) {
      throw new BadRequestException('status inválido.');
    }

    return { taskId, status };
  }

  async execute(
    context: RuntimeToolContext,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    if (!context.organizationId) {
      throw new BadRequestException(
        'Run sem Organization; tool de portfolio indisponível.',
      );
    }

    const taskId = input.taskId as string;
    const status = input.status as string;

    const task = await this.prisma.portfolioTask.findFirst({
      where: {
        id: taskId,
        organizationId: context.organizationId,
      },
    });

    if (!task) {
      throw new NotFoundException(
        'Task não encontrada nesta organização.',
      );
    }

    const updated = await this.prisma.portfolioTask.update({
      where: { id: task.id },
      data: { status },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: context.tenantId,
        actorId: context.agentId,
        action: 'runtime.tool.portfolio_task_status_changed',
        entityType: 'task',
        entityId: task.id,
        metadata: {
          runId: context.runId,
          traceId: context.traceId,
          from: task.status,
          to: updated.status,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      taskId: task.id,
      from: task.status,
      to: updated.status,
    };
  }
}
