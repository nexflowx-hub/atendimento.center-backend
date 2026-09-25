import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const definitions = [
  {
    key: 'mytrainx',
    name: 'MyTrainX',
    baseUrl: 'https://mytrainx.fit',
    inboundAuthMode: 'hmac_sha256',
    outboundAuthMode: 'hmac_sha256',
    protocol: 'mytrainx_hmac_v1',
    tenantSlugs: ['mytrainx', 'treinomilitar'],
    metadata: {
      outboundService: 'atendimento-center',
      timeoutMs: 12000,
      priority: 1,
    },
  },
  {
    key: 'facelove',
    name: 'FaceLove',
    baseUrl: 'https://facelove.online',
    inboundAuthMode: 'vercel_oidc',
    outboundAuthMode: 'none',
    protocol: 'generic',
    tenantSlugs: ['facelove'],
    metadata: { priority: 2 },
  },
  {
    key: 'mypets',
    name: 'MyPets',
    baseUrl: 'https://mypets.lat',
    inboundAuthMode: 'vercel_oidc',
    outboundAuthMode: 'none',
    protocol: 'generic',
    tenantSlugs: ['mypets'],
    metadata: { priority: 2 },
  },
  {
    key: 'novidades',
    name: 'Novidades.Store',
    baseUrl: 'https://novidades.store',
    inboundAuthMode: 'vercel_oidc',
    outboundAuthMode: 'none',
    protocol: 'generic',
    tenantSlugs: ['novidades-store'],
    metadata: { priority: 3 },
  },
  {
    key: 'atlashub',
    name: 'AtlasHub',
    baseUrl: 'https://atlashub.digital',
    inboundAuthMode: 'vercel_oidc',
    outboundAuthMode: 'none',
    protocol: 'generic',
    tenantSlugs: ['atlashub'],
    metadata: { priority: 3 },
  },
];

async function tenantIdFor(slugs) {
  const tenant = await prisma.tenant.findFirst({
    where: { slug: { in: slugs } },
    select: { id: true },
  });
  return tenant?.id ?? null;
}

async function main() {
  const applications = {};

  for (const definition of definitions) {
    const tenantId = await tenantIdFor(definition.tenantSlugs);
    const application = await prisma.integrationApplication.upsert({
      where: { key: definition.key },
      update: {
        name: definition.name,
        baseUrl: definition.baseUrl,
        inboundAuthMode: definition.inboundAuthMode,
        outboundAuthMode: definition.outboundAuthMode,
        protocol: definition.protocol,
        status: 'active',
        metadata: definition.metadata,
        ...(tenantId ? { tenantId } : {}),
      },
      create: {
        key: definition.key,
        name: definition.name,
        baseUrl: definition.baseUrl,
        inboundAuthMode: definition.inboundAuthMode,
        outboundAuthMode: definition.outboundAuthMode,
        protocol: definition.protocol,
        status: 'active',
        metadata: definition.metadata,
        ...(tenantId ? { tenantId } : {}),
      },
    });

    applications[definition.key] = application;
  }

  const coach = await prisma.agent.findUnique({ where: { key: 'coach_x' } });
  if (coach && applications.mytrainx) {
    await prisma.integrationAgent.upsert({
      where: {
        applicationId_agentId: {
          applicationId: applications.mytrainx.id,
          agentId: coach.id,
        },
      },
      update: { enabled: true },
      create: {
        applicationId: applications.mytrainx.id,
        agentId: coach.id,
        enabled: true,
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        applications: Object.fromEntries(
          Object.entries(applications).map(([key, app]) => [
            key,
            {
              id: app.id,
              baseUrl: app.baseUrl,
              inboundAuthMode: app.inboundAuthMode,
              outboundAuthMode: app.outboundAuthMode,
            },
          ]),
        ),
        coachXLinkedTo: coach ? 'mytrainx' : null,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
