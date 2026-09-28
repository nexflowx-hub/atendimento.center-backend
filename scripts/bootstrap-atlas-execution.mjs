import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseJsonEnv(name) {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${name} não contém JSON válido.`);
  }
}

function validateSecretRef(value, context) {
  if (value == null || value === '') return null;
  const ref = String(value).trim();
  if (!ref.startsWith('env:')) {
    throw new Error(`${context}: secretRef deve usar env:VARIABLE_NAME.`);
  }
  return ref;
}

async function upsertProvider(input) {
  const code = String(input.code ?? '').trim().toLowerCase();
  const name = String(input.name ?? '').trim();
  const baseUrl = String(input.baseUrl ?? '').trim();
  if (!code || !name || !baseUrl) {
    throw new Error('SMM provider exige code, name e baseUrl.');
  }

  return prisma.smmProvider.upsert({
    where: { code },
    update: {
      name,
      baseUrl,
      status: String(input.status ?? 'active'),
      secretRef: validateSecretRef(input.secretRef, `provider ${code}`),
      capabilities: input.capabilities ?? { apiStyle: 'smm-panel-v2' },
      metadata: input.metadata ?? {},
    },
    create: {
      code,
      name,
      baseUrl,
      status: String(input.status ?? 'active'),
      secretRef: validateSecretRef(input.secretRef, `provider ${code}`),
      capabilities: input.capabilities ?? { apiStyle: 'smm-panel-v2' },
      metadata: input.metadata ?? {},
    },
  });
}

async function upsertConnector(input) {
  const code = String(input.code ?? '').trim().toLowerCase();
  const name = String(input.name ?? '').trim();
  const connectorType = String(input.connectorType ?? 'external_api').trim();
  if (!code || !name) {
    throw new Error('Signals connector exige code e name.');
  }

  return prisma.signalConnector.upsert({
    where: { code },
    update: {
      name,
      connectorType,
      status: String(input.status ?? 'active'),
      secretRef: validateSecretRef(input.secretRef, `connector ${code}`),
      settings: input.settings ?? {},
    },
    create: {
      code,
      name,
      connectorType,
      status: String(input.status ?? 'active'),
      secretRef: validateSecretRef(input.secretRef, `connector ${code}`),
      settings: input.settings ?? {},
    },
  });
}

const config = parseJsonEnv('ATLAS_EXECUTION_BOOTSTRAP_JSON');
if (!config) {
  throw new Error('ATLAS_EXECUTION_BOOTSTRAP_JSON é obrigatório.');
}

try {
  const providers = [];
  for (const provider of config.smmProviders ?? []) {
    const row = await upsertProvider(provider);
    providers.push({ id: row.id, code: row.code, name: row.name });
  }

  const connectors = [];
  for (const connector of config.signalsConnectors ?? []) {
    const row = await upsertConnector(connector);
    connectors.push({ id: row.id, code: row.code, name: row.name });
  }

  console.log(JSON.stringify({ success: true, providers, connectors }, null, 2));
} finally {
  await prisma.$disconnect();
}
