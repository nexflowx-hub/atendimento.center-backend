import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Tenant } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateAgentDto, CreateFlowDto, UpdateAgentDto, UpdateFlowDto } from './agents.dto';

@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  listAgents(tenant: Tenant) {
    return this.prisma.agent.findMany({
      where: { tenantId: tenant.id },
      include: {
        bindings: {
          include: { channelAccount: true, flow: true },
        },
      },
      orderBy: [{ enabled: 'desc' }, { name: 'asc' }],
    });
  }

  createAgent(tenant: Tenant, body: CreateAgentDto) {
    return this.prisma.agent.create({
      data: {
        tenantId: tenant.id,
        code: body.code.trim().toLowerCase(),
        name: body.name.trim(),
        description: body.description,
        mode: body.mode ?? 'hybrid',
        provider: body.provider ?? 'openrouter',
        model: body.model ?? 'openai/gpt-4.1-mini',
        systemPrompt: body.systemPrompt ?? '',
        temperature: body.temperature,
        enabled: body.enabled ?? true,
        config: (body.config ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async updateAgent(tenant: Tenant, id: string, body: UpdateAgentDto) {
    const agent = await this.prisma.agent.findFirst({
      where: { id, tenantId: tenant.id },
      select: { id: true },
    });
    if (!agent) throw new NotFoundException('Agente não encontrado.');

    return this.prisma.agent.update({
      where: { id: agent.id },
      data: {
        code: body.code?.trim().toLowerCase(),
        name: body.name?.trim(),
        description: body.description,
        mode: body.mode,
        provider: body.provider,
        model: body.model,
        systemPrompt: body.systemPrompt,
        temperature: body.temperature,
        enabled: body.enabled,
        config: body.config as Prisma.InputJsonValue | undefined,
      },
    });
  }

  listFlows(tenant: Tenant) {
    return this.prisma.flowDefinition.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
  }

  createFlow(tenant: Tenant, body: CreateFlowDto) {
    return this.prisma.flowDefinition.create({
      data: {
        tenantId: tenant.id,
        code: body.code.trim().toLowerCase(),
        name: body.name.trim(),
        engine: body.engine ?? 'native',
        conversationalMode: body.conversationalMode ?? 'closed',
        externalId: body.externalId,
        status: body.status ?? 'draft',
        definition: (body.definition ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async updateFlow(tenant: Tenant, id: string, body: UpdateFlowDto) {
    const flow = await this.prisma.flowDefinition.findFirst({
      where: { id, tenantId: tenant.id },
      select: { id: true },
    });
    if (!flow) throw new NotFoundException('Fluxo não encontrado.');

    return this.prisma.flowDefinition.update({
      where: { id: flow.id },
      data: {
        code: body.code?.trim().toLowerCase(),
        name: body.name?.trim(),
        engine: body.engine,
        conversationalMode: body.conversationalMode,
        externalId: body.externalId,
        status: body.status,
        definition: body.definition as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
