export const RELATIONSHIP_STAGES = [
  'new',
  'known',
  'friendly',
  'warm',
  'flirty',
  'close',
  'premium',
  'long_term',
  'cooling_off',
] as const;

export type RelationshipStage = (typeof RELATIONSHIP_STAGES)[number];

export interface MemoryCandidate {
  category?: string;
  fact?: string;
  confidence?: number;
  importance?: number;
  action?: 'create' | 'confirm' | 'supersede' | 'ignore';
}

export interface PlannerDecision {
  conversation_intent?: string;
  relationship_delta?: Record<string, number>;
  relationship_stage?: RelationshipStage;
  tone?: string;
  reply_strategy?: string;
  media_intent?: string;
  commerce_action?: string;
  followup_candidate?: Record<string, unknown> | null;
  memory_candidates?: MemoryCandidate[];
  handoff?: boolean;
}

export interface RelationshipActionEnvelope {
  messages: Array<{ type: 'text'; text: string }>;
  media_request: Record<string, unknown> | null;
  commerce_request: Record<string, unknown> | null;
  followup_request: Record<string, unknown> | null;
  relationship_delta: Record<string, number>;
  memory_candidates: MemoryCandidate[];
  handoff: boolean;
}
