import { Injectable } from '@nestjs/common';
import { MemoryCandidateStatus, OperationalMemoryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

const ALLOWED_OPERATIONAL_KEYS = new Set([
  'preferred_language',
  'preferred_response_style',
  'communication_preference',
  'reminder_preference',
]);

@Injectable()
export class MemoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listDurable(productKey: string, userId: string, agentKey: string) {
    return this.prisma.operationalMemory.findMany({
      where: {
        productKey,
        userId,
        status: OperationalMemoryStatus.active,
        OR: [{ agentKey: null }, { agentKey }],
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
  }

  async propose(input: {
    productKey: string;
    userId: string;
    conversationId: string;
    sourceMessageId?: string;
    key: string;
    value: Prisma.InputJsonValue;
    reason?: string;
    confidence?: number;
  }) {
    return this.prisma.memoryCandidate.create({
      data: {
        productKey: input.productKey,
        userId: input.userId,
        conversationId: input.conversationId,
        sourceMessageId: input.sourceMessageId,
        key: input.key,
        value: input.value,
        reason: input.reason,
        confidence: input.confidence ?? 0.5,
        status: MemoryCandidateStatus.pending,
      },
    });
  }

  async validateAndPersist(candidateId: string, agentKey?: string) {
    const candidate = await this.prisma.memoryCandidate.findUniqueOrThrow({
      where: { id: candidateId },
    });

    if (!ALLOWED_OPERATIONAL_KEYS.has(candidate.key)) {
      return this.prisma.memoryCandidate.update({
        where: { id: candidate.id },
        data: { status: MemoryCandidateStatus.rejected, reviewedAt: new Date() },
      });
    }

    await this.prisma.$transaction([
      this.prisma.memoryCandidate.update({
        where: { id: candidate.id },
        data: { status: MemoryCandidateStatus.accepted, reviewedAt: new Date() },
      }),
      this.prisma.operationalMemory.create({
        data: {
          productKey: candidate.productKey,
          userId: candidate.userId,
          agentKey,
          key: candidate.key,
          value: candidate.value as Prisma.InputJsonValue,
          source: `memory_candidate:${candidate.id}`,
          confidence: candidate.confidence,
        },
      }),
    ]);

    return candidate;
  }
}
