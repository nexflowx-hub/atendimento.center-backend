import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { Tenant } from '@prisma/client';
import { CurrentTenant } from '../auth/auth.decorators';
import { SupabaseAuthGuard, TenantGuard } from '../auth/auth.guards';
import { CreateSmmOrderDto, ListSmmQuery } from './smm.dto';
import { SmmService } from './smm.service';

@Controller('smm')
@UseGuards(SupabaseAuthGuard, TenantGuard)
export class SmmController {
  constructor(private readonly smm: SmmService) {}

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
