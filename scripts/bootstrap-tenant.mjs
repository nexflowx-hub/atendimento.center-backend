import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const authUserId = process.env.BOOTSTRAP_AUTH_USER_ID?.trim();
const tenantName = process.env.BOOTSTRAP_TENANT_NAME?.trim() || 'Atendimento.Center';
const tenantSlug = process.env.BOOTSTRAP_TENANT_SLUG?.trim() || 'atendimento-center';
const chatwootAccountId = Number(process.env.BOOTSTRAP_CHATWOOT_ACCOUNT_ID || '1');
const evolutionInstance = process.env.BOOTSTRAP_EVOLUTION_INSTANCE?.trim() || null;

if (!authUserId) {
  throw new Error('BOOTSTRAP_AUTH_USER_ID é obrigatório.');
}

if (!Number.isInteger(chatwootAccountId) || chatwootAccountId < 1) {
  throw new Error('BOOTSTRAP_CHATWOOT_ACCOUNT_ID deve ser um inteiro positivo.');
}

try {
  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: {
      name: tenantName,
      status: 'active',
      plan: 'internal',
      chatwootAccountId,
      evolutionInstance,
    },
    create: {
      name: tenantName,
      slug: tenantSlug,
      status: 'active',
      plan: 'internal',
      chatwootAccountId,
      evolutionInstance,
    },
  });

  const membership = await prisma.tenantUser.upsert({
    where: {
      tenantId_authUserId: {
        tenantId: tenant.id,
        authUserId,
      },
    },
    update: {
      role: 'owner',
      active: true,
    },
    create: {
      tenantId: tenant.id,
      authUserId,
      role: 'owner',
      active: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        success: true,
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          chatwootAccountId: tenant.chatwootAccountId,
          evolutionInstance: tenant.evolutionInstance,
        },
        membership: {
          id: membership.id,
          authUserId: membership.authUserId,
          role: membership.role,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
