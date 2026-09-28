import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const raw = process.env.SMM_PUBLISH_OFFERS_JSON?.trim();
if (!raw) throw new Error('SMM_PUBLISH_OFFERS_JSON é obrigatório.');

let config;
try {
  config = JSON.parse(raw);
} catch {
  throw new Error('SMM_PUBLISH_OFFERS_JSON inválido.');
}

const tenant = await prisma.tenant.findUnique({
  where: { slug: String(config.tenantSlug ?? 'atlashub') },
});
if (!tenant) throw new Error('Tenant não encontrado.');

try {
  const published = [];
  for (const item of config.offers ?? []) {
    const providerCode = String(item.providerCode ?? '').trim().toLowerCase();
    const providerServiceId = String(item.providerServiceId ?? '').trim();
    const service = await prisma.smmService.findFirst({
      where: {
        providerServiceId,
        provider: { code: providerCode, status: 'active' },
        active: true,
      },
    });
    if (!service) {
      throw new Error(`Serviço ${providerCode}/${providerServiceId} não encontrado.`);
    }

    const salePrice = Number(item.salePrice);
    if (!Number.isFinite(salePrice) || salePrice <= 0) {
      throw new Error('salePrice inválido.');
    }

    const row = await prisma.smmOffer.upsert({
      where: {
        tenantId_serviceId: {
          tenantId: tenant.id,
          serviceId: service.id,
        },
      },
      update: {
        publicName: String(item.publicName ?? service.name),
        description: item.description ? String(item.description) : null,
        salePrice,
        currency: String(item.currency ?? 'BRL').toUpperCase(),
        pricingModel: String(item.pricingModel ?? 'per_unit_size'),
        unitSize: Number(item.unitSize ?? service.costUnitSize ?? 1000),
        active: item.active !== false,
        sortOrder: Number(item.sortOrder ?? 100),
        metadata: item.metadata ?? {},
      },
      create: {
        tenantId: tenant.id,
        serviceId: service.id,
        publicName: String(item.publicName ?? service.name),
        description: item.description ? String(item.description) : null,
        salePrice,
        currency: String(item.currency ?? 'BRL').toUpperCase(),
        pricingModel: String(item.pricingModel ?? 'per_unit_size'),
        unitSize: Number(item.unitSize ?? service.costUnitSize ?? 1000),
        active: item.active !== false,
        sortOrder: Number(item.sortOrder ?? 100),
        metadata: item.metadata ?? {},
      },
    });

    published.push({
      id: row.id,
      publicName: row.publicName,
      salePrice: row.salePrice.toString(),
      currency: row.currency,
      unitSize: row.unitSize,
    });
  }

  console.log(JSON.stringify({ success: true, tenant: tenant.slug, published }, null, 2));
} finally {
  await prisma.$disconnect();
}
