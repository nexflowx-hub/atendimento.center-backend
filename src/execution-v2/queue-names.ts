export const ATLAS_QUEUES = {
  agent: 'atlas.agent',
  tools: 'atlas.tools',
  followups: 'atlas.followups',
  knowledge: 'atlas.knowledge',
  notifications: 'atlas.notifications',
  integrations: 'atlas.integrations',
  portfolio: 'atlas.portfolio',
  automation: 'atlas.automation',
  signals: 'atlas.signals',
  smm: 'atlas.smm',
} as const;

export type AtlasQueueName =
  (typeof ATLAS_QUEUES)[keyof typeof ATLAS_QUEUES];
