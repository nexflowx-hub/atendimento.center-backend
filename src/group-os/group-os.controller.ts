import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
  CreateDecisionDto,
  CreateGoalDto,
  CreateProjectDto,
  CreateTaskDto,
  UpdateTaskStatusDto,
} from './group-os.dto';
import { GroupOsService } from './group-os.service';

@Controller('group-os')
@UseGuards(
  SupabaseAuthGuard,
  TenantGuard,
  TenantRoleGuard,
)
export class GroupOsController {
  constructor(private readonly groupOs: GroupOsService) {}

  @Get('structure')
  structure(@CurrentTenant() tenant: Tenant) {
    return this.groupOs.structure(tenant);
  }

  @Get('projects')
  listProjects(@CurrentTenant() tenant: Tenant) {
    return this.groupOs.listProjects(tenant);
  }

  @Get('projects/:id')
  getProject(
    @CurrentTenant() tenant: Tenant,
    @Param('id') id: string,
  ) {
    return this.groupOs.getProject(tenant, id);
  }

  @Post('projects')
  @TenantRoles('owner', 'admin', 'supervisor')
  createProject(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: SupabaseUser,
    @Body() body: CreateProjectDto,
  ) {
    return this.groupOs.createProject(tenant, body, user.id);
  }

  @Post('projects/:projectId/goals')
  @TenantRoles('owner', 'admin', 'supervisor')
  createGoal(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: SupabaseUser,
    @Param('projectId') projectId: string,
    @Body() body: CreateGoalDto,
  ) {
    return this.groupOs.createGoal(
      tenant,
      projectId,
      body,
      user.id,
    );
  }

  @Post('tasks')
  @TenantRoles('owner', 'admin', 'supervisor')
  createTask(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: SupabaseUser,
    @Body() body: CreateTaskDto,
  ) {
    return this.groupOs.createTask(tenant, body, user.id);
  }

  @Patch('tasks/:id/status')
  @TenantRoles('owner', 'admin', 'supervisor')
  updateTaskStatus(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: SupabaseUser,
    @Param('id') id: string,
    @Body() body: UpdateTaskStatusDto,
  ) {
    return this.groupOs.updateTaskStatus(
      tenant,
      id,
      body,
      user.id,
    );
  }

  @Post('decisions')
  @TenantRoles('owner', 'admin', 'supervisor')
  createDecision(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: SupabaseUser,
    @Body() body: CreateDecisionDto,
  ) {
    return this.groupOs.createDecision(
      tenant,
      body,
      user.id,
    );
  }

  @Get('approvals')
  listPendingApprovals(@CurrentTenant() tenant: Tenant) {
    return this.groupOs.listPendingApprovals(tenant);
  }
}
