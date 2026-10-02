import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { ExecutiveService } from '../../../executive/executive.service';
import type {
  RuntimeTool,
  RuntimeToolContext,
} from '../tool.types';

@Injectable()
export class ExecutiveBriefTool
  implements RuntimeTool
{
  readonly definition = {
    code: 'atlas.executive.brief',
    version: '1',
    description:
      'Read the deterministic Atlas Group OS executive brief for the current tenant/organization.',
    capability: 'executive.read',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
    outputSchema: {
      type: 'object',
    },
    sideEffect: 'none' as const,
    defaultRisk: 'low' as const,
    timeoutMs: 15000,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly executive: ExecutiveService,
  ) {}

  validate(input: unknown): Record<string, unknown> {
    if (
      input === null ||
      input === undefined
    ) {
      return {};
    }

    if (
      typeof input !== 'object' ||
      Array.isArray(input)
    ) {
      throw new Error(
        'Executive brief input deve ser um objeto vazio.',
      );
    }

    return {};
  }

  async execute(
    context: RuntimeToolContext,
  ): Promise<unknown> {
    const tenant =
      await this.prisma.tenant.findUnique({
        where: {
          id: context.tenantId,
        },
      });

    if (!tenant) {
      throw new NotFoundException(
        'Tenant não encontrado.',
      );
    }

    return this.executive.brief(tenant);
  }
}
