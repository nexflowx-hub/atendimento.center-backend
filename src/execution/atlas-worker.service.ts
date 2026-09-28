import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type SignalConnector, type SmmProvider } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { resolveSecretRef } from './secrets';
import { SmmPanelV2Adapter } from './smm/smm-panel-v2.adapter';
import { ApifySignalsAdapter } from './signals/apify-signals.adapter';

@Injectable()
export class AtlasWorkerService {
  private readonly logger = new Logger(AtlasWorkerService.name);
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  stop(): void {
    this.stopped = true;
  }

  async run(): Promise<void> {
    const intervalMs = Math.max(
      1_000,
      Number(this.config.get<string>('ATLAS_WORKER_INTERVAL_MS') ?? 5_000),
    );

    const mode = (this.config.get<string>('ATLAS_WORKER_MODE') ?? 'all').trim().toLowerCase();
    this.logger.log(`Atlas worker iniciado; mode=${mode}; intervalo=${intervalMs}ms`);

    while (!this.stopped) {
      try {
        await this.tick(mode);
      } catch (error) {
        this.logger.error(error instanceof Error ? error.stack : String(error));
      }

      await sleep(intervalMs);
    }
  }

  private async tick(mode: string): Promise<void> {
    if (mode === 'all' || mode === 'smm') {
      await this.submitPaidSmmOrders();
      await this.pollSmmOrders();
    }

    if (mode === 'all' || mode === 'signals') {
      await this.processSignalsJobs();
    }

    if (!['all', 'smm', 'signals'].includes(mode)) {
      throw new Error(`ATLAS_WORKER_MODE inválido: ${mode}`);
    }
  }

  private async submitPaidSmmOrders(): Promise<void> {
    const orders = await this.prisma.smmOrder.findMany({
      where: {
        status: 'paid',
        providerOrderReference: null,
      },
      include: {
        service: { include: { provider: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });

    for (const order of orders) {
      const claim = await this.prisma.smmOrder.updateMany({
        where: {
          id: order.id,
          status: 'paid',
          providerOrderReference: null,
        },
        data: { status: 'submitting' },
      });
      if (!claim.count) continue;

      try {
        const adapter = this.smmAdapter(order.service.provider);
        const result = await adapter.submit(
          order.service.providerServiceId,
          order.target,
          order.quantity,
        );

        await this.prisma.$transaction([
          this.prisma.smmOrder.update({
            where: { id: order.id },
            data: {
              providerOrderReference: result.orderReference,
              providerStatus: 'submitted',
              status: 'processing',
            },
          }),
          this.prisma.smmOrderEvent.create({
            data: {
              orderId: order.id,
              eventType: 'provider.submitted',
              status: 'processing',
              payload: result.raw as Prisma.InputJsonValue,
            },
          }),
        ]);
      } catch (error) {
        await this.failSmmOrder(order.id, 'provider.submit_failed', error);
      }
    }
  }

  private async pollSmmOrders(): Promise<void> {
    const orders = await this.prisma.smmOrder.findMany({
      where: {
        status: { in: ['processing', 'partial'] },
        providerOrderReference: { not: null },
      },
      include: {
        service: { include: { provider: true } },
      },
      orderBy: { updatedAt: 'asc' },
      take: 20,
    });

    for (const order of orders) {
      try {
        const adapter = this.smmAdapter(order.service.provider);
        const result = await adapter.status(order.providerOrderReference!);
        const mapped = mapProviderStatus(result.status);

        const changed =
          mapped !== order.status ||
          result.status !== order.providerStatus;

        await this.prisma.smmOrder.update({
          where: { id: order.id },
          data: {
            providerStatus: result.status,
            status: mapped,
          },
        });

        if (changed) {
          await this.prisma.smmOrderEvent.create({
            data: {
              orderId: order.id,
              eventType: 'provider.status',
              status: mapped,
              payload: {
                providerStatus: result.status,
                startCount: result.startCount ?? null,
                remains: result.remains ?? null,
              },
            },
          });
        }
      } catch (error) {
        this.logger.warn(
          `Falha ao consultar pedido SMM ${order.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private smmAdapter(provider: SmmProvider): SmmPanelV2Adapter {
    const capabilities = (provider.capabilities ?? {}) as Record<string, unknown>;
    const apiStyle = String(capabilities.apiStyle ?? 'smm-panel-v2');

    if (apiStyle !== 'smm-panel-v2') {
      throw new Error(`Adapter SMM não suportado: ${apiStyle}`);
    }
    if (!provider.baseUrl) throw new Error('Provider SMM sem baseUrl.');

    return new SmmPanelV2Adapter(
      provider.baseUrl,
      resolveSecretRef(this.config, provider.secretRef),
    );
  }

  private async failSmmOrder(
    orderId: string,
    eventType: string,
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.prisma.$transaction([
      this.prisma.smmOrder.update({
        where: { id: orderId },
        data: {
          status: 'fulfillment_failed',
          providerStatus: 'error',
        },
      }),
      this.prisma.smmOrderEvent.create({
        data: {
          orderId,
          eventType,
          status: 'fulfillment_failed',
          payload: { message },
        },
      }),
    ]);
  }

  private async processSignalsJobs(): Promise<void> {
    const jobs = await this.prisma.signalJob.findMany({
      where: { status: 'queued' },
      include: { connector: true, source: true },
      orderBy: [{ priority: 'asc' }, { scheduledAt: 'asc' }],
      take: 5,
    });

    for (const job of jobs) {
      if (!job.connector) {
        await this.prisma.signalJob.update({
          where: { id: job.id },
          data: { status: 'waiting_connector' },
        });
        continue;
      }

      const claim = await this.prisma.signalJob.updateMany({
        where: { id: job.id, status: 'queued' },
        data: {
          status: 'running',
          startedAt: new Date(),
          attempts: { increment: 1 },
        },
      });
      if (!claim.count) continue;

      try {
        const items = await this.collectSignals(
          job.connector,
          job.target,
          (job.params ?? {}) as Record<string, unknown>,
        );
        const network =
          job.source?.network ??
          String(((job.params ?? {}) as Record<string, unknown>).network ?? 'unknown');

        for (const item of items) {
          await this.prisma.signalItem.create({
            data: {
              tenantId: job.tenantId,
              jobId: job.id,
              network,
              externalId: item.externalId,
              itemType: item.itemType,
              canonicalUrl: item.canonicalUrl,
              authorHandle: item.authorHandle,
              publishedAt: item.publishedAt,
              metrics: item.metrics as Prisma.InputJsonValue,
              payload: item.payload as Prisma.InputJsonValue,
              contentHash: item.contentHash,
            },
          });
        }

        await this.prisma.signalJob.update({
          where: { id: job.id },
          data: {
            status: 'completed',
            completedAt: new Date(),
            errorMessage: null,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.prisma.signalJob.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            completedAt: new Date(),
            errorMessage: message,
          },
        });
      }
    }
  }

  private async collectSignals(
    connector: SignalConnector,
    target: string,
    params: Record<string, unknown>,
  ) {
    const settings = (connector.settings ?? {}) as Record<string, unknown>;
    const adapter = String(settings.adapter ?? connector.code).toLowerCase();

    if (adapter === 'apify' || adapter.startsWith('apify')) {
      const client = new ApifySignalsAdapter(
        resolveSecretRef(this.config, connector.secretRef),
      );
      return client.collect(target, settings, params);
    }

    throw new Error(`Signals adapter não suportado: ${adapter}`);
  }
}

function mapProviderStatus(status: string): string {
  const normalized = status.trim().toLowerCase().replace(/[ _-]+/g, '_');
  if (['completed', 'complete', 'success', 'succeeded'].includes(normalized)) return 'completed';
  if (['partial'].includes(normalized)) return 'partial';
  if (['canceled', 'cancelled'].includes(normalized)) return 'canceled';
  if (['failed', 'error'].includes(normalized)) return 'fulfillment_failed';
  return 'processing';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
