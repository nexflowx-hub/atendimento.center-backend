import {
  Body,
  Controller,
  Get,
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
import { ExecutiveDelegationDto } from './executive.dto';
import { ExecutiveService } from './executive.service';

@Controller('group-os/executive')
@UseGuards(
  SupabaseAuthGuard,
  TenantGuard,
  TenantRoleGuard,
)
export class ExecutiveController {
  constructor(
    private readonly executive: ExecutiveService,
  ) {}

  @Get('brief')
  brief(@CurrentTenant() tenant: Tenant) {
    return this.executive.brief(tenant);
  }

  @Get('decision-queue')
  decisionQueue(
    @CurrentTenant() tenant: Tenant,
  ) {
    return this.executive.decisionQueue(
      tenant,
    );
  }

  @Post('delegations')
  @TenantRoles('owner', 'admin')
  delegate(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: SupabaseUser,
    @Body() body: ExecutiveDelegationDto,
  ) {
    return this.executive.delegate(
      tenant,
      user.id,
      body,
    );
  }
}
