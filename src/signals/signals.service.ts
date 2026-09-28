import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Tenant } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { ConfigureSignalConnectorDto, CreateSignalJobDto, ListSignalsQuery } from './signals.dto';

@Injectable()
export class SignalsService {
  constructor(private readonly prisma: PrismaService) {}

  listConnectors() {
    return this.prisma.signalConnector.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        connectorType: true,
        status: true,
        settings: true,
        updatedAt: true,
        _count: {
          select: { sources: true, jobs: true },
        },
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
  }

  async configureConnector(code: string, body: ConfigureSignalConnectorDto) {
    const connector = await this.prisma.signalConnector.findUnique({
      where: { code: code.trim().toLowerCase() },
    });
    if (!connector) throw new NotFoundException('Connector Signals não encontrado.');

    return this.prisma.signalConnector.update({
      where: { id: connector.id },
      data: {
        status: body.status ?? connector.status,
        settings: body.settings
          ? ({
              ...((connector.settings ?? {}) as object),
              ...body.settings,
              configuredAt: new Date().toISOString(),
            } as Prisma.InputJsonValue)
          : undefined,
      },
      select: {
        id: true,
        code: true,
        name: true,
        connectorType: true,
        status: true,
        settings: true,
        updatedAt: true,
      },
    });
  }

  listJobs(tenant: Tenant, query: ListSignalsQuery) {
    return this.prisma.signalJob.findMany({
      where: {
        tenantId: tenant.id,
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        connector: {
          select: { id: true, code: true, name: true, connectorType: true, status: true },
        },
        source: true,
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 50,
    });
  }

  listItems(tenant: Tenant, query: ListSignalsQuery) {
    return this.prisma.signalItem.findMany({
      where: {
        tenantId: tenant.id,
        ...(query.network ? { network: query.network } : {}),
      },
      orderBy: { collectedAt: 'desc' },
      take: query.limit ?? 50,
    });
  }

  async createJob(tenant: Tenant, body: CreateSignalJobDto) {
    if (body.connectorId) {
      const connector = await this.prisma.signalConnector.findFirst({
        where: { id: body.connectorId, status: 'active' },
        select: { id: true },
      });
      if (!connector) throw new NotFoundException('Connector não encontrado ou inativo.');
    }

    if (body.sourceId) {
      const source = await this.prisma.signalSource.findFirst({
        where: { id: body.sourceId, tenantId: tenant.id, status: 'active' },
        select: { id: true },
      });
      if (!source) throw new NotFoundException('Source não encontrada neste tenant.');
    }

    return this.prisma.signalJob.create({
      data: {
        tenantId: tenant.id,
        connectorId: body.connectorId,
        sourceId: body.sourceId,
        taskType: body.taskType.trim(),
        target: body.target.trim(),
        params: (body.params ?? {}) as Prisma.InputJsonValue,
        priority: body.priority ?? 100,
        status: 'queued',
      },
    });
  }
}
