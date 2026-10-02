import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Prisma, type Tenant } from '@prisma/client';
import {
  CurrentTenant,
  CurrentUser,
  TenantRoles,
} from '../../auth/auth.decorators';
import {
  SupabaseAuthGuard,
  TenantGuard,
  TenantRoleGuard,
} from '../../auth/auth.guards';
import type { SupabaseUser } from '../../auth/auth.types';
import { PrismaService } from '../../database/prisma.service';
import { RuntimeActionService } from '../actions/runtime-action.service';
import {
  ExecuteRuntimeToolDto,
  GrantRuntimeToolDto,
  UpdateRuntimeToolGrantDto,
} from './runtime-tools.dto';
import { ToolRegistryService } from './tool-registry.service';

@Controller('runtime')
@UseGuards(
  SupabaseAuthGuard,
  TenantGuard,
  TenantRoleGuard,
)
export class RuntimeToolsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ToolRegistryService,
    private readonly actions: RuntimeActionService,
  ) {}

  @Get('tools')
  listTools() {
    return this.registry.list();
  }

  @Get('tool-grants')
  listGrants(@CurrentTenant() tenant: Tenant) {
    return this.prisma.toolGrant.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });
  }

  @Post('tool-grants')
  @TenantRoles('owner', 'admin')
  async grant(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: SupabaseUser,
    @Body() body: GrantRuntimeToolDto,
  ) {
    const agent = await this.prisma.agent.findFirst({
      where: {
        tenantId: tenant.id,
        code: body.agentCode.trim().toLowerCase(),
        enabled: true,
      },
    });

    if (!agent) {
      throw new NotFoundException('Agente ativo não encontrado.');
    }

    const tool = this.registry.resolve(body.toolCode);
    const grant = await this.prisma.toolGrant.upsert({
      where: {
        tenantId_agentId_toolCode: {
          tenantId: tenant.id,
          agentId: agent.id,
          toolCode: tool.definition.code,
        },
      },
      create: {
        tenantId: tenant.id,
        agentId: agent.id,
        toolCode: tool.definition.code,
        status: 'active',
      },
      update: {
        status: 'active',
      },
    });

    await this.audit(
      tenant.id,
      user.id,
      'runtime.tool_grant.upserted',
      grant.id,
      {
        agentId: agent.id,
        toolCode: tool.definition.code,
        status: grant.status,
      },
    );

    return grant;
  }

  @Patch('tool-grants/:id')
  @TenantRoles('owner', 'admin')
  async updateGrant(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: SupabaseUser,
    @Param('id') id: string,
    @Body() body: UpdateRuntimeToolGrantDto,
  ) {
    const grant = await this.prisma.toolGrant.findFirst({
      where: {
        id,
        tenantId: tenant.id,
      },
    });

    if (!grant) {
      throw new NotFoundException('Tool grant não encontrado.');
    }

    const updated = await this.prisma.toolGrant.update({
      where: { id: grant.id },
      data: { status: body.status },
    });

    await this.audit(
      tenant.id,
      user.id,
      'runtime.tool_grant.status_changed',
      grant.id,
      {
        agentId: grant.agentId,
        toolCode: grant.toolCode,
        from: grant.status,
        to: updated.status,
      },
    );

    return updated;
  }

  @Post('runs/:runId/actions')
  @TenantRoles('owner', 'admin', 'supervisor', 'agent')
  execute(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: SupabaseUser,
    @Param('runId') runId: string,
    @Body() body: ExecuteRuntimeToolDto,
  ) {
    return this.actions.proposeAndExecute(
      tenant,
      runId,
      body.toolCode,
      body.input,
      {
        type: 'user',
        id: user.id,
      },
    );
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
        entityType: 'tool_grant',
        entityId,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }
}
