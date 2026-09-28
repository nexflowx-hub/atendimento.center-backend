import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { Tenant } from '@prisma/client';
import { CurrentTenant, TenantRoles } from '../auth/auth.decorators';
import { SupabaseAuthGuard, TenantGuard, TenantRoleGuard } from '../auth/auth.guards';
import { ConfigureSmmProviderDto, CreateSmmOrderDto, ListSmmQuery } from './smm.dto';
import { SmmService } from './smm.service';

@Controller('smm')
@UseGuards(SupabaseAuthGuard, TenantGuard, TenantRoleGuard)
export class SmmController {
  constructor(private readonly smm: SmmService) {}

  @Get('providers')
  @TenantRoles('owner', 'admin')
  listProviders() {
    return this.smm.listProviders();
  }

  @Post('providers/:code/configure')
  @TenantRoles('owner', 'admin')
  configureProvider(
    @Param('code') code: string,
    @Body() body: ConfigureSmmProviderDto,
  ) {
    return this.smm.configureProvider(code, body);
  }

  @Post('providers/:code/sync')
  @TenantRoles('owner', 'admin')
  syncProvider(@Param('code') code: string) {
    return this.smm.syncProvider(code);
  }

  @Get('offers')
  listOffers(@CurrentTenant() tenant: Tenant) {
    return this.smm.listOffers(tenant);
  }

  @Get('orders')
  listOrders(@CurrentTenant() tenant: Tenant, @Query() query: ListSmmQuery) {
    return this.smm.listOrders(tenant, query);
  }

  @Post('orders/:id/checkout')
  createCheckout(@CurrentTenant() tenant: Tenant, @Param('id') id: string) {
    return this.smm.createCheckout(tenant, id);
  }

  @Post('orders')
  createOrder(@CurrentTenant() tenant: Tenant, @Body() body: CreateSmmOrderDto) {
    return this.smm.createOrder(tenant, body);
  }
}
