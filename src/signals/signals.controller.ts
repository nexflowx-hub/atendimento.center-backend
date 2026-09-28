import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import type { Tenant } from '@prisma/client';
import { CurrentTenant } from '../auth/auth.decorators';
import { SupabaseAuthGuard, TenantGuard } from '../auth/auth.guards';
import { CreateSignalJobDto, ListSignalsQuery } from './signals.dto';
import { SignalsService } from './signals.service';

@Controller('signals')
@UseGuards(SupabaseAuthGuard, TenantGuard)
export class SignalsController {
  constructor(private readonly signals: SignalsService) {}

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
