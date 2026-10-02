import { Prisma } from '@prisma/client';
import type { PrismaService } from '../database/prisma.service';

export type KnowledgeSearchResult = {
  chunkId: string;
  documentId: string;
  title: string;
  scopeType: string;
  scopeId: string | null;
  content: string;
  rank: number;
};

export async function searchKnowledge(
  prisma: PrismaService,
  input: {
    organizationId: string;
    query: string;
    scopeType?: string;
    scopeId?: string;
    limit?: number;
  },
): Promise<KnowledgeSearchResult[]> {
  const q = input.query.trim();
  if (!q) return [];

  const limit = Math.max(
    1,
    Math.min(20, input.limit ?? 8),
  );

  return prisma.$queryRaw<KnowledgeSearchResult[]>(
    Prisma.sql`
      select
        c.id as "chunkId",
        c.document_id as "documentId",
        d.title,
        s.scope_type as "scopeType",
        s.scope_id as "scopeId",
        c.content,
        ts_rank(
          c.search_vector,
          plainto_tsquery('simple', ${q})
        )::float8 as rank
      from knowledge.chunks c
      join knowledge.documents d
        on d.id = c.document_id
      join knowledge.sources s
        on s.id = d.source_id
      where
        c.organization_id = ${input.organizationId}::uuid
        and d.organization_id = ${input.organizationId}::uuid
        and s.organization_id = ${input.organizationId}::uuid
        and d.status = 'active'
        and s.status = 'active'
        and c.search_vector @@
          plainto_tsquery('simple', ${q})
        and (
          ${input.scopeType ?? null}::text is null
          or s.scope_type = ${input.scopeType ?? null}
        )
        and (
          ${input.scopeId ?? null}::uuid is null
          or s.scope_id = ${input.scopeId ?? null}::uuid
        )
      order by rank desc, c.ordinal asc
      limit ${limit}
    `,
  );
}
