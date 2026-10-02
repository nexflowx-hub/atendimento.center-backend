import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { searchKnowledge } from '../../../knowledge/knowledge-query';
import type {
  RuntimeTool,
  RuntimeToolContext,
} from '../tool.types';

const SCOPES = new Set([
  'organization',
  'business_unit',
  'branch',
  'project',
]);

@Injectable()
export class KnowledgeSearchTool
  implements RuntimeTool
{
  readonly definition = {
    code: 'atlas.knowledge.search',
    version: '1',
    description:
      'Search approved Atlas organization/project knowledge inside the current organization.',
    capability: 'knowledge.read',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          minLength: 1,
          maxLength: 1000,
        },
        scopeType: {
          type: 'string',
          enum: Array.from(SCOPES),
        },
        scopeId: {
          type: 'string',
          format: 'uuid',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
        },
      },
    },
    outputSchema: {
      type: 'array',
    },
    sideEffect: 'none' as const,
    defaultRisk: 'low' as const,
    timeoutMs: 10000,
  };

  constructor(private readonly prisma: PrismaService) {}

  validate(input: unknown): Record<string, unknown> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException(
        'Knowledge tool input deve ser um objeto.',
      );
    }

    const raw = input as Record<string, unknown>;
    const query =
      typeof raw.query === 'string'
        ? raw.query.trim()
        : '';

    if (!query || query.length > 1000) {
      throw new BadRequestException(
        'query inválida.',
      );
    }

    const scopeType =
      typeof raw.scopeType === 'string'
        ? raw.scopeType
        : undefined;

    if (scopeType && !SCOPES.has(scopeType)) {
      throw new BadRequestException(
        'scopeType inválido.',
      );
    }

    const scopeId =
      typeof raw.scopeId === 'string'
        ? raw.scopeId
        : undefined;

    if (
      scopeId &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        scopeId,
      )
    ) {
      throw new BadRequestException(
        'scopeId inválido.',
      );
    }

    if (scopeType && scopeType !== 'organization' && !scopeId) {
      throw new BadRequestException(
        'scopeId é obrigatório para este scopeType.',
      );
    }

    const limit =
      typeof raw.limit === 'number' &&
      Number.isInteger(raw.limit)
        ? Math.max(1, Math.min(20, raw.limit))
        : 8;

    return {
      query,
      ...(scopeType ? { scopeType } : {}),
      ...(scopeId ? { scopeId } : {}),
      limit,
    };
  }

  execute(
    context: RuntimeToolContext,
    input: Record<string, unknown>,
  ) {
    if (!context.organizationId) {
      throw new BadRequestException(
        'Run sem Organization; knowledge indisponível.',
      );
    }

    return searchKnowledge(this.prisma, {
      organizationId: context.organizationId,
      query: input.query as string,
      scopeType: input.scopeType as string | undefined,
      scopeId: input.scopeId as string | undefined,
      limit: input.limit as number,
    });
  }
}
