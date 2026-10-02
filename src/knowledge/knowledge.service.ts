import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type Tenant,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import type {
  CreateProjectMemoryDto,
  IngestKnowledgeDocumentDto,
} from './knowledge.dto';
import { searchKnowledge } from './knowledge-query';

@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  async ingest(
    tenant: Tenant,
    body: IngestKnowledgeDocumentDto,
    actorId: string,
  ) {
    const organizationId = this.organizationId(tenant);
    await this.validateScope(
      organizationId,
      body.scopeType,
      body.scopeId,
    );

    const content = this.normalize(body.content);
    if (!content) {
      throw new BadRequestException(
        'Documento sem conteúdo após normalização.',
      );
    }

    const fingerprint = createHash('sha256')
      .update(
        [
          organizationId,
          body.scopeType,
          body.scopeId ?? '',
          body.kind.trim().toLowerCase(),
          body.externalRef?.trim() ?? '',
          body.title.trim(),
          content,
        ].join('\n'),
      )
      .digest('hex');

    const existing =
      await this.prisma.knowledgeDocument.findFirst({
        where: {
          organizationId,
          fingerprint,
        },
      });

    if (existing) {
      return {
        document: existing,
        duplicate: true,
      };
    }

    const chunks = this.chunk(content);

    const result = await this.prisma.$transaction(
      async (tx) => {
        const source = await tx.knowledgeSource.create({
          data: {
            organizationId,
            scopeType: body.scopeType,
            scopeId: body.scopeId,
            kind: body.kind.trim().toLowerCase(),
            externalRef: body.externalRef?.trim(),
            label: body.title.trim(),
            metadata:
              (body.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });

        const document =
          await tx.knowledgeDocument.create({
            data: {
              organizationId,
              sourceId: source.id,
              title: body.title.trim(),
              content,
              fingerprint,
              metadata:
                (body.metadata ?? {}) as Prisma.InputJsonValue,
            },
          });

        await tx.knowledgeChunk.createMany({
          data: chunks.map((chunk, index) => ({
            organizationId,
            documentId: document.id,
            ordinal: index + 1,
            content: chunk,
            charCount: chunk.length,
          })),
        });

        return {
          source,
          document,
          chunkCount: chunks.length,
        };
      },
    );

    await this.audit(
      tenant.id,
      actorId,
      'knowledge.document.ingested',
      result.document.id,
      {
        organizationId,
        scopeType: body.scopeType,
        scopeId: body.scopeId ?? null,
        fingerprint,
        chunkCount: result.chunkCount,
      },
    );

    return {
      ...result,
      duplicate: false,
    };
  }

  async search(
    tenant: Tenant,
    query: string,
    scopeType?: string,
    scopeId?: string,
    limit?: number,
  ) {
    const organizationId = this.organizationId(tenant);

    if (scopeType) {
      await this.validateScope(
        organizationId,
        scopeType,
        scopeId,
      );
    }

    return searchKnowledge(this.prisma, {
      organizationId,
      query,
      scopeType,
      scopeId,
      limit,
    });
  }

  async addProjectMemory(
    tenant: Tenant,
    projectId: string,
    body: CreateProjectMemoryDto,
    actorId: string,
  ) {
    const organizationId = this.organizationId(tenant);
    await this.requireProject(organizationId, projectId);

    const memory = await this.prisma.projectMemory.create({
      data: {
        organizationId,
        projectId,
        category: body.category.trim().toLowerCase(),
        fact: body.fact.trim(),
        confidence: body.confidence ?? 1,
        importance: body.importance ?? 50,
        sourceRef: body.sourceRef?.trim(),
        metadata:
          (body.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    await this.audit(
      tenant.id,
      actorId,
      'portfolio.project_memory.created',
      memory.id,
      {
        organizationId,
        projectId,
        category: memory.category,
        importance: memory.importance,
      },
    );

    return memory;
  }

  async listProjectMemory(
    tenant: Tenant,
    projectId: string,
  ) {
    const organizationId = this.organizationId(tenant);
    await this.requireProject(organizationId, projectId);

    return this.prisma.projectMemory.findMany({
      where: {
        organizationId,
        projectId,
        status: 'active',
      },
      orderBy: [
        { importance: 'desc' },
        { updatedAt: 'desc' },
      ],
    });
  }

  private async validateScope(
    organizationId: string,
    scopeType: string,
    scopeId?: string,
  ) {
    if (scopeType === 'organization') {
      if (scopeId && scopeId !== organizationId) {
        throw new BadRequestException(
          'scopeId de organization não corresponde à organização atual.',
        );
      }
      return;
    }

    if (!scopeId) {
      throw new BadRequestException(
        'scopeId é obrigatório para este scopeType.',
      );
    }

    if (scopeType === 'project') {
      await this.requireProject(organizationId, scopeId);
      return;
    }

    if (scopeType === 'business_unit') {
      const item = await this.prisma.businessUnit.findFirst({
        where: {
          id: scopeId,
          organizationId,
        },
      });
      if (!item) {
        throw new BadRequestException(
          'BusinessUnit não pertence à organização atual.',
        );
      }
      return;
    }

    if (scopeType === 'branch') {
      const item = await this.prisma.branch.findFirst({
        where: {
          id: scopeId,
          organizationId,
        },
      });
      if (!item) {
        throw new BadRequestException(
          'Branch não pertence à organização atual.',
        );
      }
      return;
    }

    if (scopeType === 'agent_pack') {
      throw new BadRequestException(
        'Agent Pack knowledge ainda não está ativado neste slice.',
      );
    }

    throw new BadRequestException(
      'scopeType não suportado.',
    );
  }

  private organizationId(tenant: Tenant): string {
    if (!tenant.organizationId) {
      throw new BadRequestException(
        'Tenant sem Organization associada.',
      );
    }
    return tenant.organizationId;
  }

  private async requireProject(
    organizationId: string,
    projectId: string,
  ) {
    const project =
      await this.prisma.portfolioProject.findFirst({
        where: {
          id: projectId,
          organizationId,
        },
      });

    if (!project) {
      throw new NotFoundException(
        'Projeto não encontrado nesta organização.',
      );
    }

    return project;
  }

  private normalize(content: string): string {
    return content
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private chunk(content: string): string[] {
    const maxChars = 2400;
    const paragraphs = content
      .split(/\n\n+/)
      .map((part) => part.trim())
      .filter(Boolean);

    const chunks: string[] = [];
    let current = '';

    const flush = () => {
      if (current.trim()) {
        chunks.push(current.trim());
        current = '';
      }
    };

    for (const paragraph of paragraphs) {
      if (paragraph.length > maxChars) {
        flush();
        for (
          let offset = 0;
          offset < paragraph.length;
          offset += maxChars
        ) {
          chunks.push(
            paragraph.slice(offset, offset + maxChars),
          );
        }
        continue;
      }

      const candidate = current
        ? current + '\n\n' + paragraph
        : paragraph;

      if (candidate.length > maxChars) {
        flush();
        current = paragraph;
      } else {
        current = candidate;
      }
    }

    flush();

    return chunks.length ? chunks : [content];
  }

  private audit(
    tenantId: string,
    actorId: string,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    return this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId,
        action,
        entityType: 'knowledge',
        entityId,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }
}
