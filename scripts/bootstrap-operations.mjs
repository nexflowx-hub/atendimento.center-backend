import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const parseOperations = () => {
  const raw = process.env.BOOTSTRAP_OPERATIONS_JSON?.trim();
  if (!raw) {
    throw new Error('BOOTSTRAP_OPERATIONS_JSON é obrigatório.');
  }

  let operations;
  try {
    operations = JSON.parse(raw);
  } catch {
    throw new Error('BOOTSTRAP_OPERATIONS_JSON não contém JSON válido.');
  }

  if (!Array.isArray(operations) || operations.length === 0) {
    throw new Error('BOOTSTRAP_OPERATIONS_JSON deve conter uma lista não vazia.');
  }

  return operations.map((operation, index) => {
    const name = String(operation.name ?? '').trim();
    const slug = String(operation.slug ?? '').trim();
    const chatwootAccountId = Number(operation.chatwootAccountId);
    const evolutionInstance = operation.evolutionInstance
      ? String(operation.evolutionInstance).trim()
      : null;

    if (!name) throw new Error(`Operação #${index + 1}: name é obrigatório.`);
    if (!slug) throw new Error(`Operação #${index + 1}: slug é obrigatório.`);
    if (!Number.isInteger(chatwootAccountId) || chatwootAccountId < 1) {
      throw new Error(
        `Operação ${name}: chatwootAccountId deve ser um inteiro positivo.`,
      );
    }

    return {
      name,
      slug,
      chatwootAccountId,
      evolutionInstance: evolutionInstance || null,
    };
  });
};

const resolveOwnerAuthUserId = async () => {
  const explicit = process.env.BOOTSTRAP_AUTH_USER_ID?.trim();
  if (explicit) return explicit;

  const membership = await prisma.tenantUser.findFirst({
    where: {
      active: true,
      role: 'owner',
    },
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      authUserId: true,
    },
  });

  if (!membership) {
    throw new Error(
      'Não foi possível inferir o owner. Defina BOOTSTRAP_AUTH_USER_ID.',
    );
  }

  return membership.authUserId;
};

const operations = parseOperations();

try {
  const authUserId = await resolveOwnerAuthUserId();
  const results = [];

  for (const operation of operations) {
    const tenant = await prisma.tenant.upsert({
      where: { slug: operation.slug },
      update: {
        name: operation.name,
        status: 'active',
        plan: 'internal',
        chatwootAccountId: operation.chatwootAccountId,
        evolutionInstance: operation.evolutionInstance,
      },
      create: {
        name: operation.name,
        slug: operation.slug,
        status: 'active',
        plan: 'internal',
        chatwootAccountId: operation.chatwootAccountId,
        evolutionInstance: operation.evolutionInstance,
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

    results.push({
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
    });
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        ownerAuthUserId: authUserId,
        operations: results,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
