import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Tenant } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OpenRouterService } from '../integrations/openrouter.service';
import { RelationshipRespondDto } from './relationship.dto';
import {
  RELATIONSHIP_STAGES,
  type MemoryCandidate,
  type PlannerDecision,
  type RelationshipActionEnvelope,
} from './relationship.types';

const RELATIONSHIP_KEYS = [
  'familiarity',
  'trust',
  'emotionalCloseness',
  'flirtIntensity',
  'reciprocity',
  'engagement',
  'purchaseReadiness',
  'relationshipDepth',
] as const;

const ALLOWED_MEMORY_CATEGORIES = new Set([
  'preferred_name',
  'preference',
  'location',
  'pet',
  'work',
  'interest',
  'important_event',
  'communication_preference',
  'correction',
]);

const DEFAULT_PLANNER_PROMPT = [
  'You are the planning layer for a persistent relationship agent.',
  'Return JSON only. Do not write the final user-facing reply.',
  '',
  'Priorities:',
  '1. preserve safety, consent and factual continuity;',
  '2. answer the actual message;',
  '3. maintain a natural long-term relationship;',
  '4. adapt warmth and intimacy to reciprocity;',
  '5. use media and commerce only when contextually useful.',
  '',
  'Never treat a purchase as emotional intimacy.',
  'Never treat vulnerability as purchase intent.',
  'Never jump multiple intimacy levels in one turn.',
  'commerce_action=none is valid and often correct.',
  '',
  'Return keys: conversation_intent, relationship_delta, relationship_stage, tone,',
  'reply_strategy, media_intent, commerce_action, followup_candidate, memory_candidates, handoff.',
].join('\n');

const DEFAULT_WRITER_PROMPT = [
  'Write the final reply as the configured persona.',
  'Use the supplied planner decision, Persona Canon, World State, relationship state,',
  'memories, open loops and recent conversation.',
  '',
  'Rules:',
  '- conversational and concise by default;',
  '- do not dump stored profile facts back to the person;',
  '- do not invent biography, location, events, products, prices, payment or access;',
  '- do not add commerce unless the planner permits it;',
  '- if asked directly whether the experience is AI/virtual, answer accurately and briefly;',
  '- never claim payment or entitlement unless supplied as verified data.',
  '',
  'Return JSON only in the shape {"messages":[{"type":"text","text":"..."}]}.',
].join('\n');

const DEFAULT_MEMORY_PROMPT = [
  'Extract only durable relationship memory candidates.',
  'Good candidates: preferred name, stable interests, pets, volunteered work/lifestyle facts,',
  'important future events, stable communication preferences and corrections.',
  '',
  'Do not store transient small talk, unnecessary intimate detail, inferred sensitive traits,',
  'inferred age, biometric identity, third-party private data or hidden reasoning.',
  '',
  'Return JSON only in the shape {"candidates":[{"category":"preference","fact":"...",',
  '"confidence":0.9,"importance":60,"action":"create"}]}.',
].join('\n');

@Injectable()
export class RelationshipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly openRouter: OpenRouterService,
  ) {}

  async getContext(
    tenant: Tenant,
    agentCode: string,
    contactId: string,
    conversationRefId?: string,
  ) {
    const [agent, contact] = await Promise.all([
      this.prisma.agent.findFirst({
        where: {
          tenantId: tenant.id,
          code: agentCode.trim().toLowerCase(),
        },
        include: {
          versions: {
            orderBy: { version: 'desc' },
            take: 1,
          },
          bindings: {
            where: { enabled: true },
            include: { channelAccount: true, flow: true },
            orderBy: { priority: 'asc' },
          },
        },
      }),
      this.prisma.contact.findFirst({
        where: { id: contactId, tenantId: tenant.id },
      }),
    ]);

    if (!agent) throw new NotFoundException('Agente não encontrado.');
    if (!contact) throw new NotFoundException('Contato não encontrado.');

    const now = new Date();
    const [relationship, memories, openLoops, worldState, summary] =
      await Promise.all([
        this.prisma.relationshipState.findFirst({
          where: { tenantId: tenant.id, contactId, agentId: agent.id },
        }),
        this.prisma.conversationMemory.findMany({
          where: {
            tenantId: tenant.id,
            contactId,
            agentId: agent.id,
            status: 'active',
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          orderBy: [
            { importance: 'desc' },
            { lastConfirmedAt: 'desc' },
          ],
          take: 30,
        }),
        this.prisma.openLoop.findMany({
          where: {
            tenantId: tenant.id,
            contactId,
            agentId: agent.id,
            status: 'open',
          },
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
          take: 20,
        }),
        this.prisma.agentWorldState.findFirst({
          where: {
            tenantId: tenant.id,
            agentId: agent.id,
            validFrom: { lte: now },
            OR: [{ validUntil: null }, { validUntil: { gt: now } }],
          },
          orderBy: { validFrom: 'desc' },
        }),
        conversationRefId
          ? this.prisma.conversationSummary.findFirst({
              where: {
                tenantId: tenant.id,
                conversationRefId,
                contactId,
                agentId: agent.id,
              },
            })
          : Promise.resolve(null),
      ]);

    return {
      agent,
      contact,
      relationship:
        relationship ??
        this.defaultRelationshipState(contactId, agent.id, tenant.id),
      memories,
      openLoops,
      worldState,
      summary,
    };
  }

  async respond(tenant: Tenant, body: RelationshipRespondDto) {
    const startedAt = Date.now();
    const agentCode = body.agentCode.trim().toLowerCase();

    if (body.eventId) {
      const prior = await this.prisma.agentRun.findFirst({
        where: { tenantId: tenant.id, eventId: body.eventId },
      });
      if (prior?.responseEnvelope) {
        return {
          duplicate: true,
          runId: prior.id,
          envelope: prior.responseEnvelope,
        };
      }
    }

    const context = await this.getContext(
      tenant,
      agentCode,
      body.contactId,
      body.conversationRefId,
    );
    const { agent, contact } = context;

    if (!agent.enabled) {
      throw new BadRequestException('Agente está desativado.');
    }

    const state = await this.ensureRelationshipState(
      tenant.id,
      body.contactId,
      agent.id,
    );

    const config = asRecord(agent.config);
    const plannerPrompt =
      readString(config.relationshipPlannerPrompt) ?? DEFAULT_PLANNER_PROMPT;
    const writerPrompt =
      readString(config.responseWriterPrompt) ?? DEFAULT_WRITER_PROMPT;
    const memoryPrompt =
      readString(config.memoryExtractorPrompt) ?? DEFAULT_MEMORY_PROMPT;

    const runtimePayload = {
      persona_canon: agent.systemPrompt,
      persona_version: agent.versions[0]?.version ?? null,
      channel_bindings: agent.bindings.map((binding) => ({
        channel: binding.channelAccount?.channelType ?? null,
        provider: binding.channelAccount?.provider ?? null,
        name: binding.channelAccount?.name ?? null,
        conditions: binding.conditions,
      })),
      contact: {
        id: contact.id,
        preferred_name: contact.name,
        locale: contact.locale,
        timezone: contact.timezone,
        adult_status: contact.adultStatus,
      },
      relationship_state: state,
      durable_memory: context.memories.map((memory) => ({
        category: memory.category,
        fact: memory.fact,
        confidence: memory.confidence,
        importance: memory.importance,
      })),
      open_loops: context.openLoops.map((loop) => ({
        id: loop.id,
        topic: loop.topic,
        due_after: loop.dueAfter,
        priority: loop.priority,
      })),
      world_state: context.worldState,
      rolling_summary: context.summary?.rollingSummary ?? null,
      recent_conversation: (body.recentConversation ?? []).slice(-20),
      verified_runtime: body.runtime ?? {},
      current_message: body.currentMessage,
    };

    const model = agent.model;
    const temperature = agent.temperature ? Number(agent.temperature) : 0.65;
    const existingRun = body.eventId
      ? await this.prisma.agentRun.findFirst({
          where: { tenantId: tenant.id, eventId: body.eventId },
        })
      : null;

    const run = existingRun
      ? await this.prisma.agentRun.update({
          where: { id: existingRun.id },
          data: {
            result: 'processing',
            errorMessage: null,
            responseEnvelope: Prisma.JsonNull,
          },
        })
      : await this.prisma.agentRun.create({
          data: {
            tenantId: tenant.id,
            eventId: body.eventId,
            contactId: contact.id,
            agentId: agent.id,
            conversationRefId: body.conversationRefId,
            model,
            decision: {},
            result: 'processing',
          },
        });

    try {
      const plannerRaw = await this.openRouter.complete(
        [
          { role: 'system', content: plannerPrompt },
          {
            role: 'user',
            content: JSON.stringify(runtimePayload),
          },
        ],
        { model, temperature: Math.min(temperature, 0.4) },
      );

      const plannerDecision =
        parseJsonObject<PlannerDecision>(plannerRaw) ??
        this.defaultPlannerDecision();

      plannerDecision.relationship_delta = sanitizeRelationshipDelta(
        plannerDecision.relationship_delta,
      );

      if (
        plannerDecision.relationship_stage &&
        !RELATIONSHIP_STAGES.includes(plannerDecision.relationship_stage)
      ) {
        delete plannerDecision.relationship_stage;
      }

      const writerRaw = await this.openRouter.complete(
        [
          {
            role: 'system',
            content: agent.systemPrompt + '\n\n' + writerPrompt,
          },
          {
            role: 'user',
            content: JSON.stringify({
              planner_decision: plannerDecision,
              context: runtimePayload,
            }),
          },
        ],
        { model, temperature },
      );

      const messages = parseWriterMessages(writerRaw);
      const memoryCandidates = await this.extractMemoryCandidatesSafe(
        memoryPrompt,
        model,
        body.currentMessage,
        body.recentConversation ?? [],
      );

      const envelope: RelationshipActionEnvelope = {
        messages,
        media_request: this.mediaRequest(
          plannerDecision.media_intent,
          contact.adultStatus,
        ),
        commerce_request:
          plannerDecision.commerce_action &&
          plannerDecision.commerce_action !== 'none'
            ? { action: plannerDecision.commerce_action }
            : null,
        followup_request: plannerDecision.followup_candidate ?? null,
        relationship_delta: plannerDecision.relationship_delta ?? {},
        memory_candidates: memoryCandidates,
        handoff: Boolean(plannerDecision.handoff),
      };

      await this.applyRelationshipDecision(
        state.id,
        plannerDecision,
        body.currentMessage,
      );
      await this.persistMemoryCandidates(
        tenant.id,
        contact.id,
        agent.id,
        body.eventId,
        memoryCandidates,
      );

      await this.prisma.agentRun.update({
        where: { id: run.id },
        data: {
          plannerVersion:
            readString(config.relationshipPlannerVersion) ??
            'relationship-planner-v1',
          promptVersion:
            readString(config.responseWriterVersion) ??
            'relationship-writer-v1',
          decision: plannerDecision as Prisma.InputJsonValue,
          responseEnvelope: envelope as unknown as Prisma.InputJsonValue,
          latencyMs: Date.now() - startedAt,
          result: 'completed',
          errorMessage: null,
        },
      });

      return {
        duplicate: false,
        runId: run.id,
        envelope,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await this.prisma.agentRun.update({
        where: { id: run.id },
        data: {
          latencyMs: Date.now() - startedAt,
          result: 'failed',
          errorMessage: message,
        },
      });

      throw error;
    }
  }

  private async ensureRelationshipState(
    tenantId: string,
    contactId: string,
    agentId: string,
  ) {
    const existing = await this.prisma.relationshipState.findFirst({
      where: { tenantId, contactId, agentId },
    });
    if (existing) return existing;

    return this.prisma.relationshipState.create({
      data: { tenantId, contactId, agentId },
    });
  }

  private async extractMemoryCandidatesSafe(
    prompt: string,
    model: string,
    currentMessage: string,
    recentConversation: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<MemoryCandidate[]> {
    try {
      return await this.extractMemoryCandidates(
        prompt,
        model,
        currentMessage,
        recentConversation,
      );
    } catch {
      return [];
    }
  }

  private async extractMemoryCandidates(
    prompt: string,
    model: string,
    currentMessage: string,
    recentConversation: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<MemoryCandidate[]> {
    const raw = await this.openRouter.complete(
      [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: JSON.stringify({
            recent_conversation: recentConversation.slice(-8),
            current_message: currentMessage,
          }),
        },
      ],
      { model, temperature: 0.1 },
    );

    const parsed = parseJsonObject<{ candidates?: MemoryCandidate[] }>(raw);
    const candidates = Array.isArray(parsed?.candidates)
      ? parsed.candidates
      : [];

    return candidates
      .filter((candidate) => {
        const category = candidate.category?.trim();
        const fact = candidate.fact?.trim();
        const confidence = Number(candidate.confidence ?? 0);
        return (
          Boolean(category) &&
          ALLOWED_MEMORY_CATEGORIES.has(category as string) &&
          Boolean(fact) &&
          (fact as string).length <= 1000 &&
          confidence >= 0.78 &&
          candidate.action !== 'ignore'
        );
      })
      .map((candidate) => ({
        category: candidate.category?.trim(),
        fact: candidate.fact?.trim(),
        confidence: Math.min(
          1,
          Math.max(0, Number(candidate.confidence ?? 0.8)),
        ),
        importance: Math.min(
          100,
          Math.max(0, Math.round(Number(candidate.importance ?? 50))),
        ),
        action: candidate.action ?? 'create',
      }));
  }

  private async persistMemoryCandidates(
    tenantId: string,
    contactId: string,
    agentId: string,
    sourceMessageId: string | undefined,
    candidates: MemoryCandidate[],
  ): Promise<void> {
    for (const candidate of candidates) {
      if (!candidate.category || !candidate.fact) continue;

      const existing = await this.prisma.conversationMemory.findFirst({
        where: {
          tenantId,
          contactId,
          agentId,
          category: candidate.category,
          fact: candidate.fact,
          status: 'active',
        },
      });

      if (existing) {
        await this.prisma.conversationMemory.update({
          where: { id: existing.id },
          data: {
            confidence: Math.max(
              existing.confidence,
              Number(candidate.confidence ?? 0.8),
            ),
            importance: Math.max(
              existing.importance,
              Number(candidate.importance ?? 50),
            ),
            lastConfirmedAt: new Date(),
          },
        });
        continue;
      }

      await this.prisma.conversationMemory.create({
        data: {
          tenantId,
          contactId,
          agentId,
          category: candidate.category,
          fact: candidate.fact,
          confidence: Number(candidate.confidence ?? 0.8),
          importance: Number(candidate.importance ?? 50),
          sourceMessageId,
        },
      });
    }
  }

  private async applyRelationshipDecision(
    stateId: string,
    decision: PlannerDecision,
    currentMessage: string,
  ): Promise<void> {
    const current = await this.prisma.relationshipState.findUnique({
      where: { id: stateId },
    });
    if (!current) return;

    const data: Record<string, unknown> = {
      lastInteractionAt: new Date(),
      lastTopic: currentMessage.slice(0, 240),
    };

    const delta = sanitizeRelationshipDelta(decision.relationship_delta);
    for (const key of RELATIONSHIP_KEYS) {
      const amount = delta[key];
      if (typeof amount !== 'number') continue;
      const before = Number(current[key]);
      data[key] = clamp100(before + amount);
    }

    if (
      decision.relationship_stage &&
      RELATIONSHIP_STAGES.includes(decision.relationship_stage)
    ) {
      data.stage = decision.relationship_stage;
    }

    await this.prisma.relationshipState.update({
      where: { id: stateId },
      data: data as Prisma.RelationshipStateUncheckedUpdateInput,
    });
  }

  private mediaRequest(
    mediaIntent: string | undefined,
    adultStatus: string,
  ): Record<string, unknown> | null {
    if (!mediaIntent || mediaIntent === 'none') return null;

    const adultRated = new Set([
      'sensual_non_explicit',
      'premium_preview',
      'adult',
      'explicit',
    ]);

    if (adultRated.has(mediaIntent) && adultStatus !== 'confirmed_18_plus') {
      return null;
    }

    return { intent: mediaIntent };
  }

  private defaultPlannerDecision(): PlannerDecision {
    return {
      conversation_intent: 'connect',
      relationship_delta: {},
      tone: 'warm',
      reply_strategy: 'answer_and_share',
      media_intent: 'none',
      commerce_action: 'none',
      followup_candidate: null,
      memory_candidates: [],
      handoff: false,
    };
  }

  private defaultRelationshipState(
    contactId: string,
    agentId: string,
    tenantId: string,
  ) {
    return {
      id: null,
      tenantId,
      contactId,
      agentId,
      stage: 'new',
      familiarity: 0,
      trust: 0,
      emotionalCloseness: 0,
      flirtIntensity: 0,
      reciprocity: 0,
      engagement: 0,
      purchaseReadiness: 0,
      relationshipDepth: 0,
      lastMood: null,
      lastTopic: null,
      lastInteractionAt: null,
    };
  }
}

function sanitizeRelationshipDelta(
  value: Record<string, number> | undefined,
): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  const sanitized: Record<string, number> = {};

  for (const key of RELATIONSHIP_KEYS) {
    const raw = Number(value[key]);
    if (!Number.isFinite(raw)) continue;
    sanitized[key] = Math.max(-10, Math.min(10, Math.round(raw)));
  }

  return sanitized;
}

function parseWriterMessages(
  raw: string,
): Array<{ type: 'text'; text: string }> {
  const parsed = parseJsonObject<{
    messages?: Array<{ type?: string; text?: string }>;
  }>(raw);

  const messages = Array.isArray(parsed?.messages)
    ? parsed.messages
        .filter(
          (message) =>
            message?.type === 'text' &&
            typeof message.text === 'string' &&
            message.text.trim().length > 0,
        )
        .slice(0, 3)
        .map((message) => ({
          type: 'text' as const,
          text: (message.text as string).trim(),
        }))
    : [];

  if (messages.length) return messages;

  const fallback = raw.trim();
  if (!fallback) {
    throw new Error('Response Writer retornou resposta vazia.');
  }

  return [{ type: 'text', text: fallback }];
}

function parseJsonObject<T>(raw: string): T | null {
  const trimmed = raw.trim();
  const unwrapped = trimmed
    .replace(/^\`\`\`(?:json)?\s*/i, '')
    .replace(/\s*\`\`\`$/, '');

  try {
    const value = JSON.parse(unwrapped);
    return value && typeof value === 'object' ? (value as T) : null;
  } catch {
    const first = unwrapped.indexOf('{');
    const last = unwrapped.lastIndexOf('}');
    if (first < 0 || last <= first) return null;

    try {
      return JSON.parse(unwrapped.slice(first, last + 1)) as T;
    } catch {
      return null;
    }
  }
}

function asRecord(
  value: Prisma.JsonValue | null | undefined,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function clamp100(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
