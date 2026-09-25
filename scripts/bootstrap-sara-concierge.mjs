import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const systemPrompt = `You are Sara Concierge — IA, the AI-assisted concierge persona for MyTrainX.

IDENTITY:
- You are NOT the real human Sara.
- Never claim to be the real Sara, never imply a human is typing when that is not true.
- If needed, explicitly say you are the MyTrainX AI concierge inspired by the service style of Sara.
- The real Sara may also participate in Atendimento.Center/Chatwoot as a human agent. Keep that distinction clear.

MISSION:
- Welcome users and leads.
- Help with onboarding and orientation inside MyTrainX.
- Explain how MyTrainX works at a high level.
- Help authenticated users understand access/entitlements using approved tools.
- Support sales conversations only with factual product/offer information supplied by approved tools or trusted thread context.
- Never invent product names, prices, discounts, availability, bonuses, guarantees or purchase conditions.
- If the requested commercial information is not available, state that clearly and route the user to the current catalog or human support rather than guessing.
- Do not diagnose, prescribe medication or present yourself as a medical, nutrition or clinical professional.
- Do not expose private user data or discuss another user's account.

MEMORY:
- Conversational preferences may become memory candidates.
- MyTrainX profile, purchases, subscriptions and entitlements are authoritative domain data and must come from tools, not durable conversational memory.

TONE:
- Warm, practical, concise and welcoming.
- Portuguese by default when the user writes in Portuguese.
`;

async function main() {
  const mytrainx = await prisma.integrationApplication.findUniqueOrThrow({
    where: { key: 'mytrainx' },
  });

  const agent = await prisma.agent.upsert({
    where: { key: 'sara_concierge_ai' },
    update: {
      name: 'Sara Concierge — IA',
      description:
        'AI-assisted MyTrainX concierge for welcome, onboarding, support and sales qualification. Distinct from the real human Sara.',
      status: 'active',
    },
    create: {
      key: 'sara_concierge_ai',
      name: 'Sara Concierge — IA',
      description:
        'AI-assisted MyTrainX concierge for welcome, onboarding, support and sales qualification. Distinct from the real human Sara.',
      status: 'active',
    },
  });

  await prisma.integrationAgent.upsert({
    where: {
      applicationId_agentId: {
        applicationId: mytrainx.id,
        agentId: agent.id,
      },
    },
    update: { enabled: true },
    create: {
      applicationId: mytrainx.id,
      agentId: agent.id,
      enabled: true,
    },
  });

  const version = await prisma.agentVersion.upsert({
    where: {
      agentId_version: {
        agentId: agent.id,
        version: 1,
      },
    },
    update: {
      label: 'B1.1',
      provider: 'openrouter',
      model: process.env.OPENROUTER_MODEL || 'openai/gpt-4.1-mini',
      temperature: 0.3,
      systemPrompt,
      skills: ['welcome', 'onboarding', 'support', 'sales_qualification'],
      safetyPolicy: {
        impersonateHumanSara: 'disallowed',
        inventCommercialOffer: 'disallowed',
        clinicalAdvice: 'disallowed',
        identityOverride: 'disallowed',
      },
      memoryPolicy: {
        mode: 'candidate_then_validate',
        automaticPromotion: false,
      },
      channelPolicy: {
        web: true,
        whatsapp: true,
        instagram: true,
        facebook: true,
      },
      active: true,
    },
    create: {
      agentId: agent.id,
      version: 1,
      label: 'B1.1',
      provider: 'openrouter',
      model: process.env.OPENROUTER_MODEL || 'openai/gpt-4.1-mini',
      temperature: 0.3,
      systemPrompt,
      skills: ['welcome', 'onboarding', 'support', 'sales_qualification'],
      safetyPolicy: {
        impersonateHumanSara: 'disallowed',
        inventCommercialOffer: 'disallowed',
        clinicalAdvice: 'disallowed',
        identityOverride: 'disallowed',
      },
      memoryPolicy: {
        mode: 'candidate_then_validate',
        automaticPromotion: false,
      },
      channelPolicy: {
        web: true,
        whatsapp: true,
        instagram: true,
        facebook: true,
      },
      active: true,
    },
  });

  const allowedTools = ['get_user_profile', 'get_entitlements'];

  for (const key of allowedTools) {
    const tool = await prisma.toolRegistry.findUnique({ where: { key } });
    if (!tool) {
      throw new Error(
        `Tool ${key} not found. Run bootstrap-agent-core.mjs first.`,
      );
    }

    await prisma.agentVersionTool.upsert({
      where: {
        agentVersionId_toolId: {
          agentVersionId: version.id,
          toolId: tool.id,
        },
      },
      update: { enabled: true },
      create: {
        agentVersionId: version.id,
        toolId: tool.id,
        enabled: true,
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        agent: agent.key,
        version: version.version,
        tools: allowedTools,
        identity: 'ai_assisted_distinct_from_human_sara',
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
