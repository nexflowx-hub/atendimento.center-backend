import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { Tenant } from '@prisma/client';
import { CurrentTenant, TenantRoles } from '../auth/auth.decorators';
import { SupabaseAuthGuard, TenantGuard, TenantRoleGuard } from '../auth/auth.guards';
import { ConfigureSignalConnectorDto, CreateSignalJobDto, ListSignalsQuery } from './signals.dto';
import { SignalsService } from './signals.service';

@Controller('signals')
@UseGuards(SupabaseAuthGuard, TenantGuard, TenantRoleGuard)
export class SignalsController {
  constructor(private readonly signals: SignalsService) {}

  @Get('connectors')
  @TenantRoles('owner', 'admin')
  listConnectors() {
    return this.signals.listConnectors();
  }

  @Post('connectors/:code/configure')
  @TenantRoles('owner', 'admin')
  configureConnector(
    @Param('code') code: string,
    @Body() body: ConfigureSignalConnectorDto,
  ) {
    return this.signals.configureConnector(code, body);
  }

  @Get('jobs')
  listJobs(@CurrentTenant() tenant: Tenant, @Query() query: ListSignalsQuery) {
    return this.signals.listJobs(tenant, query);
  }

  @Post('jobs')
  createJob(@CurrentTenant() tenant: Tenant, @Body() body: CreateSignalJobDto) {
    return this.signals.createJob(tenant, body);
  }

  @Get('items')
  listItems(@CurrentTenant() tenant: Tenant, @Query() query: ListSignalsQuery) {
    return this.signals.listItems(tenant, query);
  }
}
