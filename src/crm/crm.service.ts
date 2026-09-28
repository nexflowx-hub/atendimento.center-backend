import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Tenant } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateContactDto, CreateLeadDto, ListCrmQuery, UpdateLeadDto } from './crm.dto';

@Injectable()
export class CrmService {
  constructor(private readonly prisma: PrismaService) {}

  listContacts(tenant: Tenant, query: ListCrmQuery) {
    const q = query.q?.trim();
    return this.prisma.contact.findMany({
      where: {
        tenantId: tenant.id,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: query.limit ?? 50,
    });
  }

  createContact(tenant: Tenant, body: CreateContactDto) {
    return this.prisma.contact.create({
      data: {
        tenantId: tenant.id,
        externalKey: body.externalKey,
        name: body.name,
        email: body.email?.toLowerCase(),
        phone: body.phone,
        telegramUsername: body.telegramUsername,
        source: body.source,
        locale: body.locale,
        metadata: (body.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  listLeads(tenant: Tenant, query: ListCrmQuery) {
    return this.prisma.lead.findMany({
      where: {
        tenantId: tenant.id,
        ...(query.status ? { status: query.status } : {}),
      },
      include: { contact: true },
      orderBy: { updatedAt: 'desc' },
      take: query.limit ?? 50,
    });
  }

  async createLead(tenant: Tenant, body: CreateLeadDto) {
    if (body.contactId) {
      const contact = await this.prisma.contact.findFirst({
        where: { id: body.contactId, tenantId: tenant.id },
        select: { id: true },
      });
      if (!contact) throw new NotFoundException('Contacto não encontrado neste tenant.');
    }

    return this.prisma.lead.create({
      data: {
        tenantId: tenant.id,
        contactId: body.contactId,
        source: body.source,
        stage: body.stage,
        score: body.score,
        productCode: body.productCode,
        metadata: (body.metadata ?? {}) as Prisma.InputJsonValue,
      },
      include: { contact: true },
    });
  }

  async updateLead(tenant: Tenant, leadId: string, body: UpdateLeadDto) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId: tenant.id },
      select: { id: true, metadata: true },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado.');

    return this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        status: body.status,
        stage: body.stage,
        score: body.score,
        ownerAuthUserId: body.ownerAuthUserId,
        metadata: body.metadata
          ? ({ ...((lead.metadata ?? {}) as object), ...body.metadata } as Prisma.InputJsonValue)
          : undefined,
      },
      include: { contact: true },
    });
  }
}
