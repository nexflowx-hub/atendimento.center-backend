-- Relationship Engine hardening.
-- These schemas are private/non-exposed and accessed through the NestJS backend.
-- Enable RLS as defense in depth, matching the rest of Atlas Platform Core.

alter table channels.contact_identities enable row level security;
alter table ai.relationship_states enable row level security;
alter table ai.conversation_memories enable row level security;
alter table ai.conversation_summaries enable row level security;
alter table ai.open_loops enable row level security;
alter table ai.world_states enable row level security;
alter table ai.agent_runs enable row level security;
alter table ai.followups enable row level security;

create index if not exists contact_identities_channel_account_idx
  on channels.contact_identities(channel_account_id);

create index if not exists relationship_states_agent_idx
  on ai.relationship_states(agent_id);

create index if not exists conversation_memories_agent_idx
  on ai.conversation_memories(agent_id);

create index if not exists conversation_summaries_agent_idx
  on ai.conversation_summaries(agent_id);
create index if not exists conversation_summaries_tenant_idx
  on ai.conversation_summaries(tenant_id);

create index if not exists open_loops_contact_idx
  on ai.open_loops(contact_id);
create index if not exists open_loops_agent_idx
  on ai.open_loops(agent_id);

create index if not exists world_states_tenant_idx
  on ai.world_states(tenant_id);

create index if not exists agent_runs_contact_fk_idx
  on ai.agent_runs(contact_id);
create index if not exists agent_runs_agent_fk_idx
  on ai.agent_runs(agent_id);
create index if not exists agent_runs_conversation_ref_idx
  on ai.agent_runs(conversation_ref_id);

create index if not exists followups_agent_idx
  on ai.followups(agent_id);
