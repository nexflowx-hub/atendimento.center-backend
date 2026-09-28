import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function resolveSecretRef(secretRef) {
  if (!secretRef?.startsWith('env:')) {
    throw new Error('Provider sem secretRef env:VARIABLE_NAME.');
  }
  const key = secretRef.slice(4).trim();
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Secret ${key} não configurado.`);
  return value;
}

function normalizeToken(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9 ]+/g, ' ')
    .toLowerCase();
}

function inferPlatform(category, name) {
  const text = normalizeToken(`${category} ${name}`);
  const platforms = [
    ['instagram', 'instagram'],
    ['tiktok', 'tiktok'],
    ['youtube', 'youtube'],
    ['facebook', 'facebook'],
    ['telegram', 'telegram'],
    ['twitter', 'x'],
    [' x ', 'x'],
    ['linkedin', 'linkedin'],
    ['spotify', 'spotify'],
    ['discord', 'discord'],
    ['twitch', 'twitch'],
    ['website', 'web'],
    ['traffic', 'web'],
  ];
  for (const [needle, value] of platforms) {
    if (` ${text} `.includes(needle.startsWith(' ') ? needle : ` ${needle} `)) return value;
  }
  return 'other';
}

function inferCategory(category, name) {
  const text = normalizeToken(`${category} ${name}`);
  const rules = [
    ['followers', ['followers', 'follower', 'seguidores', 'subscriber', 'subscribers']],
    ['views', ['views', 'view', 'visualizacoes', 'watch']],
    ['likes', ['likes', 'like', 'curtidas']],
    ['comments', ['comments', 'comment', 'comentarios']],
    ['shares', ['shares', 'share', 'compartilhamentos']],
    ['saves', ['saves', 'save', 'salvamentos']],
    ['members', ['members', 'member', 'membros']],
    ['traffic', ['traffic', 'website visits', 'visits']],
    ['engagement', ['engagement', 'impressions', 'reach']],
  ];
  for (const [categoryName, needles] of rules) {
    if (needles.some((needle) => text.includes(needle))) return categoryName;
  }
  return 'other';
}

function slugType(value) {
  const normalized = normalizeToken(value).trim().replace(/\s+/g, '_');
  return normalized || 'standard';
}

async function callServices(provider) {
  const apiKey = resolveSecretRef(provider.secretRef);
  const body = new URLSearchParams({ key: apiKey, action: 'services' });
  const response = await fetch(provider.baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Provider respondeu JSON inválido (HTTP ${response.status}).`);
  }
  if (!response.ok) throw new Error(`Provider HTTP ${response.status}.`);
  if (!Array.isArray(payload)) {
    throw new Error(String(payload?.error ?? 'Provider services não devolveu uma lista.'));
  }
  return payload;
}

const providerCode = process.argv[2] ?? process.env.SMM_PROVIDER_CODE;
if (!providerCode) {
  throw new Error('Uso: node scripts/sync-smm-provider.mjs PROVIDER_CODE');
}

try {
  const provider = await prisma.smmProvider.findUnique({
    where: { code: String(providerCode).trim().toLowerCase() },
  });
  if (!provider || provider.status !== 'active' || !provider.baseUrl) {
    throw new Error('Provider não encontrado/ativo ou sem baseUrl.');
  }

  const capabilities = provider.capabilities ?? {};
  if (String(capabilities.apiStyle ?? 'smm-panel-v2') !== 'smm-panel-v2') {
    throw new Error('Sync automático v1 suporta apenas apiStyle=smm-panel-v2.');
  }

  const services = await callServices(provider);
  let upserted = 0;

  for (const item of services) {
    const providerServiceId = String(item.service ?? '').trim();
    const name = String(item.name ?? '').trim();
    if (!providerServiceId || !name) continue;

    const rate = Number(item.rate);
    const min = Number(item.min);
    const max = Number(item.max);
    const rawCategory = String(item.category ?? '');
    const rawType = String(item.type ?? 'standard');

    await prisma.smmService.upsert({
      where: {
        providerId_providerServiceId: {
          providerId: provider.id,
          providerServiceId,
        },
      },
      update: {
        platform: inferPlatform(rawCategory, name),
        category: inferCategory(rawCategory, name),
        serviceType: slugType(rawType),
        name,
        description: rawCategory || null,
        minQuantity: Number.isFinite(min) ? Math.trunc(min) : null,
        maxQuantity: Number.isFinite(max) ? Math.trunc(max) : null,
        costAmount: Number.isFinite(rate) ? rate : null,
        costCurrency: String(capabilities.currency ?? 'USD').toUpperCase(),
        costUnitSize: Number(capabilities.rateUnitSize ?? 1000),
        refillSupported: Boolean(item.refill),
        cancelSupported: Boolean(item.cancel),
        active: true,
        metadata: {
          rawCategory,
          rawType,
          rawRate: item.rate ?? null,
          syncedAt: new Date().toISOString(),
        },
      },
      create: {
        providerId: provider.id,
        providerServiceId,
        platform: inferPlatform(rawCategory, name),
        category: inferCategory(rawCategory, name),
        serviceType: slugType(rawType),
        name,
        description: rawCategory || null,
        minQuantity: Number.isFinite(min) ? Math.trunc(min) : null,
        maxQuantity: Number.isFinite(max) ? Math.trunc(max) : null,
        costAmount: Number.isFinite(rate) ? rate : null,
        costCurrency: String(capabilities.currency ?? 'USD').toUpperCase(),
        costUnitSize: Number(capabilities.rateUnitSize ?? 1000),
        refillSupported: Boolean(item.refill),
        cancelSupported: Boolean(item.cancel),
        active: true,
        metadata: {
          rawCategory,
          rawType,
          rawRate: item.rate ?? null,
          syncedAt: new Date().toISOString(),
        },
      },
    });
    upserted += 1;
  }

  console.log(JSON.stringify({
    success: true,
    provider: provider.code,
    received: services.length,
    upserted,
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
