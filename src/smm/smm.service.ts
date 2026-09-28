import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type SmmProvider, type Tenant } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { resolveSecretRef } from '../execution/secrets';
import { SmmPanelV2Adapter } from '../execution/smm/smm-panel-v2.adapter';
import { XPaymentsService } from '../integrations/xpayments.service';
import {
  ConfigureSmmProviderDto,
  CreateSmmOrderDto,
  ListSmmQuery,
  ListSmmServicesQuery,
  PublicSmmOffersQuery,
  UpsertSmmOfferDto,
} from './smm.dto';

@Injectable()
export class SmmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xpayments: XPaymentsService,
    private readonly config: ConfigService,
  ) {}

  async listPublicOffers(tenantSlug: string, query: PublicSmmOffersQuery) {
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        slug: tenantSlug.trim().toLowerCase(),
        status: { in: ['trial', 'active'] },
      },
      select: { id: true, slug: true, name: true },
    });
    if (!tenant) throw new NotFoundException('Storefront SMM não encontrado.');

    const q = query.q?.trim();
    const offers = await this.prisma.smmOffer.findMany({
      where: {
        tenantId: tenant.id,
        active: true,
        service: {
          active: true,
          provider: { status: 'active' },
          ...(query.platform ? { platform: query.platform.trim().toLowerCase() } : {}),
          ...(query.category
            ? { category: { contains: query.category.trim(), mode: 'insensitive' } }
            : {}),
        },
        ...(q
          ? {
              OR: [
                { publicName: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
                { service: { category: { contains: q, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        publicName: true,
        description: true,
        salePrice: true,
        currency: true,
        pricingModel: true,
        unitSize: true,
        sortOrder: true,
        service: {
          select: {
            platform: true,
            category: true,
            serviceType: true,
            minQuantity: true,
            maxQuantity: true,
            refillSupported: true,
            cancelSupported: true,
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { publicName: 'asc' }],
      take: query.limit ?? 100,
    });

    return {
      success: true,
      storefront: {
        tenant: tenant.slug,
        name: tenant.name,
      },
      offers,
    };
  }

  listProviders() {
    return this.prisma.smmProvider.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        baseUrl: true,
        status: true,
        capabilities: true,
        metadata: true,
        updatedAt: true,
        _count: { select: { services: true } },
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
  }

  async configureProvider(code: string, body: ConfigureSmmProviderDto) {
    const provider = await this.prisma.smmProvider.findUnique({
      where: { code: code.trim().toLowerCase() },
      select: { id: true, code: true },
    });
    if (!provider) throw new NotFoundException('Provider SMM não encontrado.');

    const baseUrl = body.baseUrl.trim().replace(/\/$/, '');
    return this.prisma.smmProvider.update({
      where: { id: provider.id },
      data: {
        baseUrl,
        status: body.status ?? 'pending_configuration',
        metadata: {
          configuredAt: new Date().toISOString(),
        },
      },
      select: {
        id: true,
        code: true,
        name: true,
        baseUrl: true,
        status: true,
        capabilities: true,
        metadata: true,
        updatedAt: true,
      },
    });
  }

  async syncProvider(code: string) {
    const provider = await this.prisma.smmProvider.findUnique({
      where: { code: code.trim().toLowerCase() },
    });
    if (!provider) throw new NotFoundException('Provider SMM não encontrado.');
    if (!provider.baseUrl) {
      throw new BadRequestException('Provider sem baseUrl configurada.');
    }
    if (!provider.secretRef) {
      throw new BadRequestException('Provider sem secret_ref configurado.');
    }

    const adapter = this.providerAdapter(provider);
    const raw = await adapter.services();
    if (!Array.isArray(raw)) {
      throw new BadRequestException('Provider não devolveu uma lista de serviços.');
    }

    let imported = 0;
    let skipped = 0;
    const syncedAt = new Date().toISOString();
    const rateUnitSize = positiveInt(
      (provider.capabilities as Record<string, unknown> | null)?.rateUnitSize,
      1000,
    );

    for (const item of raw) {
      if (!item || typeof item !== 'object') {
        skipped += 1;
        continue;
      }

      const row = item as Record<string, unknown>;
      const providerServiceId = firstString(row.service, row.id);
      const name = firstString(row.name);
      if (!providerServiceId || !name) {
        skipped += 1;
        continue;
      }

      const category = firstString(row.category) ?? 'Uncategorized';
      const serviceType = firstString(row.type) ?? 'default';
      const rate = nullableDecimal(row.rate);
      const minQuantity = nullableInt(row.min);
      const maxQuantity = nullableInt(row.max);

      await this.prisma.smmService.upsert({
        where: {
          providerId_providerServiceId: {
            providerId: provider.id,
            providerServiceId,
          },
        },
        update: {
          platform: inferPlatform(name, category),
          category,
          serviceType,
          name,
          description: firstString(row.description),
          minQuantity,
          maxQuantity,
          costAmount: rate,
          costCurrency: firstString(row.currency)?.toUpperCase() ?? 'USD',
          costUnitSize: rateUnitSize,
          refillSupported: toBoolean(row.refill),
          cancelSupported: toBoolean(row.cancel),
          active: true,
          metadata: {
            dripfeed: row.dripfeed ?? null,
            syncedAt,
            providerPayload: row,
          } as Prisma.InputJsonValue,
        },
        create: {
          providerId: provider.id,
          providerServiceId,
          platform: inferPlatform(name, category),
          category,
          serviceType,
          name,
          description: firstString(row.description),
          minQuantity,
          maxQuantity,
          costAmount: rate,
          costCurrency: firstString(row.currency)?.toUpperCase() ?? 'USD',
          costUnitSize: rateUnitSize,
          refillSupported: toBoolean(row.refill),
          cancelSupported: toBoolean(row.cancel),
          active: true,
          metadata: {
            dripfeed: row.dripfeed ?? null,
            syncedAt,
            providerPayload: row,
          } as Prisma.InputJsonValue,
        },
      });
      imported += 1;
    }

    await this.prisma.smmProvider.update({
      where: { id: provider.id },
      data: {
        status: 'active',
        metadata: {
          ...((provider.metadata ?? {}) as object),
          lastCatalogSyncAt: syncedAt,
          lastCatalogServiceCount: imported,
          lastCatalogSkipped: skipped,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      success: true,
      provider: provider.code,
      imported,
      skipped,
      syncedAt,
    };
  }

  private providerAdapter(provider: SmmProvider): SmmPanelV2Adapter {
    const capabilities = (provider.capabilities ?? {}) as Record<string, unknown>;
    const apiStyle = String(capabilities.apiStyle ?? 'smm-panel-v2');

    if (apiStyle !== 'smm-panel-v2') {
      throw new BadRequestException(`Adapter SMM não suportado: ${apiStyle}`);
    }
    if (!provider.baseUrl) throw new BadRequestException('Provider sem baseUrl configurada.');

    return new SmmPanelV2Adapter(
      provider.baseUrl,
      resolveSecretRef(this.config, provider.secretRef),
    );
  }

  listServices(query: ListSmmServicesQuery) {
    const q = query.q?.trim();
    return this.prisma.smmService.findMany({
      where: {
        active: true,
        ...(query.providerCode
          ? { provider: { code: query.providerCode.trim().toLowerCase() } }
          : {}),
        ...(query.platform ? { platform: query.platform.trim().toLowerCase() } : {}),
        ...(query.category
          ? { category: { contains: query.category.trim(), mode: 'insensitive' } }
          : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { category: { contains: q, mode: 'insensitive' } },
                { providerServiceId: { contains: q } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        providerServiceId: true,
        platform: true,
        category: true,
        serviceType: true,
        name: true,
        description: true,
        minQuantity: true,
        maxQuantity: true,
        costAmount: true,
        costCurrency: true,
        costUnitSize: true,
        refillSupported: true,
        cancelSupported: true,
        active: true,
        metadata: true,
        provider: {
          select: {
            code: true,
            name: true,
            status: true,
          },
        },
      },
      orderBy: [{ platform: 'asc' }, { category: 'asc' }, { name: 'asc' }],
      take: query.limit ?? 100,
    });
  }

  async upsertOffer(tenant: Tenant, body: UpsertSmmOfferDto) {
    const service = await this.prisma.smmService.findFirst({
      where: { id: body.serviceId, active: true, provider: { status: 'active' } },
      select: {
        id: true,
        providerId: true,
        costAmount: true,
        costCurrency: true,
        costUnitSize: true,
      },
    });
    if (!service) {
      throw new NotFoundException('Serviço SMM não encontrado ou provider inativo.');
    }

    return this.prisma.smmOffer.upsert({
      where: {
        tenantId_serviceId: {
          tenantId: tenant.id,
          serviceId: service.id,
        },
      },
      update: {
        publicName: body.publicName.trim(),
        description: body.description?.trim(),
        salePrice: new Prisma.Decimal(body.salePrice),
        currency: (body.currency ?? 'BRL').trim().toUpperCase(),
        pricingModel: body.pricingModel ?? 'per_unit_size',
        unitSize: body.unitSize ?? service.costUnitSize ?? 1000,
        active: body.active ?? true,
        sortOrder: body.sortOrder ?? 100,
        metadata: ({
          ...(body.metadata ?? {}),
          providerCostSnapshot: service.costAmount?.toString() ?? null,
          providerCostCurrency: service.costCurrency,
          providerCostUnitSize: service.costUnitSize,
          publishedAt: new Date().toISOString(),
        }) as Prisma.InputJsonValue,
      },
      create: {
        tenantId: tenant.id,
        serviceId: service.id,
        publicName: body.publicName.trim(),
        description: body.description?.trim(),
        salePrice: new Prisma.Decimal(body.salePrice),
        currency: (body.currency ?? 'BRL').trim().toUpperCase(),
        pricingModel: body.pricingModel ?? 'per_unit_size',
        unitSize: body.unitSize ?? service.costUnitSize ?? 1000,
        active: body.active ?? true,
        sortOrder: body.sortOrder ?? 100,
        metadata: ({
          ...(body.metadata ?? {}),
          providerCostSnapshot: service.costAmount?.toString() ?? null,
          providerCostCurrency: service.costCurrency,
          providerCostUnitSize: service.costUnitSize,
          publishedAt: new Date().toISOString(),
        }) as Prisma.InputJsonValue,
      },
      include: {
        service: {
          select: {
            id: true,
            platform: true,
            category: true,
            serviceType: true,
            name: true,
            minQuantity: true,
            maxQuantity: true,
            refillSupported: true,
            cancelSupported: true,
          },
        },
      },
    });
  }

  listOffers(tenant: Tenant) {
    return this.prisma.smmOffer.findMany({
      where: { tenantId: tenant.id, active: true, service: { active: true } },
      include: {
        service: {
          select: {
            id: true,
            platform: true,
            category: true,
            serviceType: true,
            name: true,
            description: true,
            minQuantity: true,
            maxQuantity: true,
            refillSupported: true,
            cancelSupported: true,
            metadata: true,
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { publicName: 'asc' }],
    });
  }

  listOrders(tenant: Tenant, query: ListSmmQuery) {
    return this.prisma.smmOrder.findMany({
      where: {
        tenantId: tenant.id,
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        offer: true,
        service: {
          select: {
            platform: true,
            category: true,
            serviceType: true,
            name: true,
          },
        },
        events: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 50,
    });
  }

  async createCheckout(tenant: Tenant, orderId: string) {
    const order = await this.prisma.smmOrder.findFirst({
      where: { id: orderId, tenantId: tenant.id },
      include: { contact: true },
    });

    if (!order) throw new NotFoundException('Pedido SMM não encontrado.');

    if (['paid', 'submitting', 'processing', 'completed'].includes(order.status)) {
      throw new NotFoundException('Este pedido já não aceita novo checkout.');
    }

    const reference = order.paymentReference ?? `ATLASSMM-${order.id}`;
    const amountCents = Math.max(1, Math.round(Number(order.amount) * 100));

    const checkout = await this.xpayments.createCheckout({
      amountCents,
      currency: order.currency,
      reference,
      customerEmail: order.contact?.email,
      metadata: {
        atlasOrderId: order.id,
        atlasTenantId: tenant.id,
        product: 'smm',
      },
    });

    await this.prisma.$transaction([
      this.prisma.smmOrder.update({
        where: { id: order.id },
        data: {
          paymentSystem: 'xpayments',
          paymentReference: reference,
          status: 'payment_pending',
          metadata: ({
            ...((order.metadata ?? {}) as object),
            checkoutSessionId: checkout.sessionId,
            checkoutUrl: checkout.checkoutUrl,
          }) as Prisma.InputJsonValue,
        },
      }),
      this.prisma.smmOrderEvent.create({
        data: {
          orderId: order.id,
          eventType: 'payment.checkout.created',
          status: 'payment_pending',
          payload: {
            paymentSystem: 'xpayments',
            paymentReference: reference,
            sessionId: checkout.sessionId,
            checkoutUrl: checkout.checkoutUrl,
          },
        },
      }),
    ]);

    return checkout;
  }

  async createOrder(tenant: Tenant, body: CreateSmmOrderDto) {
    const offer = await this.prisma.smmOffer.findFirst({
      where: {
        id: body.offerId,
        tenantId: tenant.id,
        active: true,
        service: { active: true },
      },
      include: { service: true },
    });

    if (!offer) throw new NotFoundException('Oferta SMM não encontrada ou inativa.');

    if (
      (offer.service.minQuantity && body.quantity < offer.service.minQuantity) ||
      (offer.service.maxQuantity && body.quantity > offer.service.maxQuantity)
    ) {
      throw new NotFoundException('Quantidade fora dos limites desta oferta.');
    }

    if (body.contactId) {
      const contact = await this.prisma.contact.findFirst({
        where: { id: body.contactId, tenantId: tenant.id },
        select: { id: true },
      });
      if (!contact) throw new NotFoundException('Contacto não encontrado neste tenant.');
    }

    const amount =
      offer.pricingModel === 'fixed'
        ? offer.salePrice
        : offer.salePrice.mul(body.quantity).div(offer.unitSize);

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.smmOrder.create({
        data: {
          tenantId: tenant.id,
          contactId: body.contactId,
          offerId: offer.id,
          serviceId: offer.serviceId,
          target: body.target.trim(),
          quantity: body.quantity,
          amount,
          currency: offer.currency,
          paymentSystem: body.paymentSystem,
          paymentReference: body.paymentReference,
          status: body.paymentReference ? 'payment_pending' : 'quote_created',
          metadata: ({
            ...(body.metadata ?? {}),
            pricingModel: offer.pricingModel,
            unitSize: offer.unitSize,
            unitPrice: offer.salePrice.toString(),
          }) as Prisma.InputJsonValue,
        },
      });

      await tx.smmOrderEvent.create({
        data: {
          orderId: order.id,
          eventType: 'order.created',
          status: order.status,
          payload: {
            offerId: offer.id,
            quantity: body.quantity,
            amount: amount.toString(),
            currency: offer.currency,
          },
        },
      });

      return order;
    });
  }
}


function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function nullableInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function nullableDecimal(value: unknown): Prisma.Decimal | null {
  if (value === null || value === undefined || value === '') return null;
  try {
    return new Prisma.Decimal(String(value));
  } catch {
    return null;
  }
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'y', 'available'].includes(value.trim().toLowerCase());
  }
  return false;
}

function inferPlatform(name: string, category: string): string {
  const value = `${category} ${name}`.toLowerCase();
  const rules: Array<[string, string[]]> = [
    ['instagram', ['instagram', ' ig ']],
    ['tiktok', ['tiktok', 'tik tok']],
    ['youtube', ['youtube', 'yt ']],
    ['facebook', ['facebook', 'fb ']],
    ['telegram', ['telegram']],
    ['x', ['twitter', ' x.com', ' x ']],
    ['linkedin', ['linkedin']],
    ['threads', ['threads']],
    ['spotify', ['spotify']],
    ['twitch', ['twitch']],
    ['discord', ['discord']],
    ['website', ['website traffic', 'web traffic', 'traffic']],
  ];

  for (const [platform, needles] of rules) {
    if (needles.some((needle) => value.includes(needle))) return platform;
  }
  return 'other';
}
