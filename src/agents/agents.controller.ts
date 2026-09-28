import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { Tenant } from '@prisma/client';
import { CurrentTenant, TenantRoles } from '../auth/auth.decorators';
import { SupabaseAuthGuard, TenantGuard, TenantRoleGuard } from '../auth/auth.guards';
import { CreateAgentDto, CreateFlowDto, UpdateAgentDto, UpdateFlowDto } from './agents.dto';
import { AgentsService } from './agents.service';

@Controller()
@UseGuards(SupabaseAuthGuard, TenantGuard, TenantRoleGuard)
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get('agents')
  listAgents(@CurrentTenant() tenant: Tenant) {
    return this.agents.listAgents(tenant);
  }

  @Post('agents')
  @TenantRoles('owner', 'admin')
  createAgent(@CurrentTenant() tenant: Tenant, @Body() body: CreateAgentDto) {
    return this.agents.createAgent(tenant, body);
  }

  @Patch('agents/:id')
  @TenantRoles('owner', 'admin')
  updateAgent(
    @CurrentTenant() tenant: Tenant,
    @Param('id') id: string,
    @Body() body: UpdateAgentDto,
  ) {
    return this.agents.updateAgent(tenant, id, body);
  }

  @Get('flows')
  listFlows(@CurrentTenant() tenant: Tenant) {
    return this.agents.listFlows(tenant);
  }

  @Post('flows')
  @TenantRoles('owner', 'admin')
  createFlow(@CurrentTenant() tenant: Tenant, @Body() body: CreateFlowDto) {
    return this.agents.createFlow(tenant, body);
  }

  @Patch('flows/:id')
  @TenantRoles('owner', 'admin')
  updateFlow(
    @CurrentTenant() tenant: Tenant,
    @Param('id') id: string,
    @Body() body: UpdateFlowDto,
  ) {
    return this.agents.updateFlow(tenant, id, body);
  }
}
