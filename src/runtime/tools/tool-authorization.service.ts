import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ToolAuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async authorizedToolCodes(
    tenantId: string,
    agentId: string,
  ): Promise<string[]> {
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, tenantId, enabled: true },
      select: { id: true },
    });
    if (!agent) return [];

    const explicit = await this.prisma.toolGrant.findMany({
      where: {
        tenantId,
        agentId,
        status: 'active',
        // Constraint interpretation is not implemented in this slice. Fail closed.
        constraints: { equals: {} },
      },
      select: { toolCode: true },
    });

    const codes = new Set(
      explicit.map((item) => item.toolCode),
    );

    const assignment =
      await this.prisma.agentPackAssignment.findFirst({
        where: {
          tenantId,
          agentId,
          status: 'active',
        },
      });

    if (!assignment) {
      return Array.from(codes).sort();
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { organizationId: true },
    });

    if (!tenant?.organizationId) {
      return Array.from(codes).sort();
    }

    const version =
      await this.prisma.agentPackVersion.findFirst({
        where: {
          id: assignment.packVersionId,
          status: 'approved',
        },
      });

    if (!version) {
      return Array.from(codes).sort();
    }

    const pack = await this.prisma.agentPack.findFirst({
      where: {
        id: version.packId,
        organizationId: tenant.organizationId,
        status: 'active',
      },
      select: { id: true },
    });

    if (!pack) {
      return Array.from(codes).sort();
    }

    const packTools =
      await this.prisma.agentPackTool.findMany({
        where: {
          packVersionId: version.id,
          mode: 'allowed',
          constraints: { equals: {} },
        },
        select: { toolCode: true },
      });

    for (const item of packTools) {
      codes.add(item.toolCode);
    }

    return Array.from(codes).sort();
  }

  async isAuthorized(
    tenantId: string,
    agentId: string,
    toolCode: string,
  ): Promise<boolean> {
    const codes = await this.authorizedToolCodes(
      tenantId,
      agentId,
    );

    return codes.includes(toolCode);
  }
}
