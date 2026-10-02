import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type Tenant,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import type {
  AddAgentPackToolDto,
  CreateAgentPackDto,
  CreateAgentPackVersionDto,
  ReviewAgentPackVersionDto,
} from './agent-packs.dto';

@Injectable()
export class AgentPacksService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenant: Tenant) {
    const organizationId = this.organizationId(tenant);

    return this.prisma.agentPack.findMany({
      where: {
        organizationId,
        status: { not: 'retired' },
      },
      orderBy: { code: 'asc' },
    });
  }

  async create(
    tenant: Tenant,
    body: CreateAgentPackDto,
    actorId: string,
  ) {
    const organizationId = this.organizationId(tenant);

    const pack = await this.prisma.agentPack.create({
      data: {
        organizationId,
        code: body.code.trim().toLowerCase(),
        name: body.name.trim(),
        role: body.role.trim(),
        department: body.department?.trim(),
        description: body.description?.trim(),
        metadata:
          (body.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    await this.audit(
      tenant.id,
      actorId,
      'agent_pack.created',
      pack.id,
      { organizationId, code: pack.code },
    );

    return pack;
  }

  async createVersion(
    tenant: Tenant,
    packId: string,
    body: CreateAgentPackVersionDto,
    actorId: string,
  ) {
    const pack = await this.requirePack(
      this.organizationId(tenant),
      packId,
    );

    const aggregate =
      await this.prisma.agentPackVersion.aggregate({
        where: { packId: pack.id },
        _max: { version: true },
      });

    const version =
      await this.prisma.agentPackVersion.create({
        data: {
          packId: pack.id,
          version:
            (aggregate._max.version ?? 0) + 1,
          status: 'draft',
          instructions: body.instructions.trim(),
          modelPolicy:
            (body.modelPolicy ??
              {}) as Prisma.InputJsonValue,
          capabilityPolicy:
            (body.capabilityPolicy ??
              {}) as Prisma.InputJsonValue,
          metadata:
            (body.metadata ??
              {}) as Prisma.InputJsonValue,
        },
      });

    await this.audit(
      tenant.id,
      actorId,
      'agent_pack.version_created',
      version.id,
      {
        packId: pack.id,
        version: version.version,
      },
    );

    return version;
  }

  async reviewVersion(
    tenant: Tenant,
    versionId: string,
    body: ReviewAgentPackVersionDto,
    actorId: string,
  ) {
    const version = await this.requireVersion(
      this.organizationId(tenant),
      versionId,
    );

    if (version.status !== 'draft') {
      throw new BadRequestException(
        'Apenas versões draft podem receber review.',
      );
    }

    const updated =
      await this.prisma.agentPackVersion.update({
        where: { id: version.id },
        data: {
          evaluationStatus:
            body.evaluationStatus,
        },
      });

    await this.audit(
      tenant.id,
      actorId,
      'agent_pack.version_reviewed',
      version.id,
      {
        evaluationStatus:
          body.evaluationStatus,
      },
    );

    return updated;
  }

  async approveVersion(
    tenant: Tenant,
    versionId: string,
    actorId: string,
  ) {
    const version = await this.requireVersion(
      this.organizationId(tenant),
      versionId,
    );

    if (version.status !== 'draft') {
      throw new BadRequestException(
        'Versão não está em draft.',
      );
    }

    if (
      !['passed', 'waived'].includes(
        version.evaluationStatus,
      )
    ) {
      throw new BadRequestException(
        'Versão precisa passar review antes da aprovação.',
      );
    }

    const updated =
      await this.prisma.agentPackVersion.update({
        where: { id: version.id },
        data: {
          status: 'approved',
          approvedBy: actorId,
          approvedAt: new Date(),
        },
      });

    await this.audit(
      tenant.id,
      actorId,
      'agent_pack.version_approved',
      version.id,
      {
        packId: version.packId,
        version: version.version,
      },
    );

    return updated;
  }

  async addTool(
    tenant: Tenant,
    versionId: string,
    body: AddAgentPackToolDto,
    actorId: string,
  ) {
    if (body.constraints && Object.keys(body.constraints).length) {
      throw new BadRequestException('Tool constraints are not supported in this slice; constrained tools cannot be authorized.');
    }
    const version = await this.requireVersion(
      this.organizationId(tenant),
      versionId,
    );

    if (version.status !== 'draft') {
      throw new BadRequestException(
        'Tools só podem ser alterados em versão draft.',
      );
    }

    const definition =
      await this.prisma.toolDefinitionRecord.findFirst({
        where: {
          code: body.toolCode,
          enabled: true,
        },
        orderBy: { version: 'desc' },
      });

    if (!definition) {
      throw new BadRequestException(
        'Tool não registrada ou desativada.',
      );
    }

    const item = await this.prisma.agentPackTool.upsert({
      where: {
        packVersionId_toolCode: {
          packVersionId: version.id,
          toolCode: definition.code,
        },
      },
      create: {
        packVersionId: version.id,
        toolCode: definition.code,
        mode: 'allowed',
        constraints:
          (body.constraints ??
            {}) as Prisma.InputJsonValue,
      },
      update: {
        mode: 'allowed',
        constraints:
          (body.constraints ??
            {}) as Prisma.InputJsonValue,
      },
    });

    await this.audit(
      tenant.id,
      actorId,
      'agent_pack.tool_added',
      item.id,
      {
        packVersionId: version.id,
        toolCode: definition.code,
      },
    );

    return item;
  }

  async assign(
    tenant: Tenant,
    agentId: string,
    versionId: string,
    actorId: string,
  ) {
    const organizationId = this.organizationId(tenant);

    const agent = await this.prisma.agent.findFirst({
      where: {
        id: agentId,
        tenantId: tenant.id,
        enabled: true,
      },
    });

    if (!agent) {
      throw new NotFoundException(
        'Agente ativo não encontrado neste tenant.',
      );
    }

    const version = await this.requireVersion(
      organizationId,
      versionId,
    );

    if (version.status !== 'approved') {
      throw new BadRequestException(
        'Apenas versões aprovadas podem ser atribuídas.',
      );
    }

    const assignment =
      await this.prisma.agentPackAssignment.upsert({
        where: {
          tenantId_agentId: {
            tenantId: tenant.id,
            agentId: agent.id,
          },
        },
        create: {
          tenantId: tenant.id,
          agentId: agent.id,
          packVersionId: version.id,
          status: 'active',
          assignedBy: actorId,
        },
        update: {
          packVersionId: version.id,
          status: 'active',
          assignedBy: actorId,
          assignedAt: new Date(),
        },
      });

    await this.audit(
      tenant.id,
      actorId,
      'agent_pack.assigned',
      assignment.id,
      {
        agentId: agent.id,
        packVersionId: version.id,
      },
    );

    return assignment;
  }

  async assignment(
    tenant: Tenant,
    agentId: string,
  ) {
    const agent = await this.prisma.agent.findFirst({
      where: {
        id: agentId,
        tenantId: tenant.id,
      },
    });

    if (!agent) {
      throw new NotFoundException(
        'Agente não encontrado neste tenant.',
      );
    }

    return this.prisma.agentPackAssignment.findFirst({
      where: {
        tenantId: tenant.id,
        agentId,
        status: 'active',
      },
    });
  }

  private async requirePack(
    organizationId: string,
    packId: string,
  ) {
    const pack = await this.prisma.agentPack.findFirst({
      where: {
        id: packId,
        organizationId,
        status: { not: 'retired' },
      },
    });

    if (!pack) {
      throw new NotFoundException(
        'Agent Pack não encontrado.',
      );
    }

    return pack;
  }

  private async requireVersion(
    organizationId: string,
    versionId: string,
  ) {
    const version =
      await this.prisma.agentPackVersion.findFirst({
        where: {
          id: versionId,
        },
      });

    if (!version) {
      throw new NotFoundException(
        'Agent Pack version não encontrada.',
      );
    }

    await this.requirePack(
      organizationId,
      version.packId,
    );

    return version;
  }

  private organizationId(tenant: Tenant): string {
    if (!tenant.organizationId) {
      throw new BadRequestException(
        'Tenant sem Organization associada.',
      );
    }
    return tenant.organizationId;
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
        entityType: 'agent_pack',
        entityId,
        metadata:
          metadata as Prisma.InputJsonValue,
      },
    });
  }
}
