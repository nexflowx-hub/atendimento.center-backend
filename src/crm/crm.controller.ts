import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { Tenant } from '@prisma/client';
import { CurrentTenant } from '../auth/auth.decorators';
import { SupabaseAuthGuard, TenantGuard } from '../auth/auth.guards';
import { CreateContactDto, CreateLeadDto, ListCrmQuery, UpdateLeadDto } from './crm.dto';
import { CrmService } from './crm.service';

@Controller('crm')
@UseGuards(SupabaseAuthGuard, TenantGuard)
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get('contacts')
  listContacts(@CurrentTenant() tenant: Tenant, @Query() query: ListCrmQuery) {
    return this.crm.listContacts(tenant, query);
  }

  @Post('contacts')
  createContact(@CurrentTenant() tenant: Tenant, @Body() body: CreateContactDto) {
    return this.crm.createContact(tenant, body);
  }

  @Get('leads')
  listLeads(@CurrentTenant() tenant: Tenant, @Query() query: ListCrmQuery) {
    return this.crm.listLeads(tenant, query);
  }

  @Post('leads')
  createLead(@CurrentTenant() tenant: Tenant, @Body() body: CreateLeadDto) {
    return this.crm.createLead(tenant, body);
  }

  @Patch('leads/:leadId')
  updateLead(
    @CurrentTenant() tenant: Tenant,
    @Param('leadId') leadId: string,
    @Body() body: UpdateLeadDto,
  ) {
    return this.crm.updateLead(tenant, leadId, body);
  }
}
