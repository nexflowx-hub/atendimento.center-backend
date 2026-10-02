import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Tenant } from '@prisma/client';
import {
  CurrentTenant,
  CurrentUser,
  TenantRoles,
} from '../auth/auth.decorators';
import {
  SupabaseAuthGuard,
  TenantGuard,
  TenantRoleGuard,
} from '../auth/auth.guards';
import type { SupabaseUser } from '../auth/auth.types';
import {
  AddAgentPackToolDto,
  CreateAgentPackDto,
  CreateAgentPackVersionDto,
  ReviewAgentPackVersionDto,
} from './agent-packs.dto';
import { AgentPacksService } from './agent-packs.service';

@Controller('group-os')
@UseGuards(
  SupabaseAuthGuard,
  TenantGuard,
  TenantRoleGuard,
)
export class AgentPacksController {
  constructor(
    private readonly packs: AgentPacksService,
  ) {}

  @Get('agent-packs')
  list(@CurrentTenant() tenant: Tenant) {
    return this.packs.list(tenant);
  }

  @Post('agent-packs')
  @TenantRoles('owner', 'admin')
  create(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: SupabaseUser,
    @Body() body: CreateAgentPackDto,
  ) {
    return this.packs.create(
      tenant,
      body,
      user.id,
    );
  }

  @Post('agent-packs/:id/versions')
  @TenantRoles('owner', 'admin')
  createVersion(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: SupabaseUser,
    @Param('id') id: string,
    @Body() body: CreateAgentPackVersionDto,
  ) {
    return this.packs.createVersion(
      tenant,
      id,
      body,
      user.id,
    );
  }

  @Post('agent-pack-versions/:id/review')
  @TenantRoles('owner', 'admin')
  review(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: SupabaseUser,
    @Param('id') id: string,
    @Body() body: ReviewAgentPackVersionDto,
  ) {
    return this.packs.reviewVersion(
      tenant,
      id,
      body,
      user.id,
    );
  }

  @Post('agent-pack-versions/:id/approve')
  @TenantRoles('owner', 'admin')
  approve(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: SupabaseUser,
    @Param('id') id: string,
  ) {
    return this.packs.approveVersion(
      tenant,
      id,
      user.id,
    );
  }

  @Post('agent-pack-versions/:id/tools')
  @TenantRoles('owner', 'admin')
  addTool(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: SupabaseUser,
    @Param('id') id: string,
    @Body() body: AddAgentPackToolDto,
  ) {
    return this.packs.addTool(
      tenant,
      id,
      body,
      user.id,
    );
  }

  @Post('agents/:agentId/pack-assignment/:versionId')
  @TenantRoles('owner', 'admin')
  assign(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: SupabaseUser,
    @Param('agentId') agentId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.packs.assign(
      tenant,
      agentId,
      versionId,
      user.id,
    );
  }

  @Get('agents/:agentId/pack-assignment')
  assignment(
    @CurrentTenant() tenant: Tenant,
    @Param('agentId') agentId: string,
  ) {
    return this.packs.assignment(
      tenant,
      agentId,
    );
  }
}
