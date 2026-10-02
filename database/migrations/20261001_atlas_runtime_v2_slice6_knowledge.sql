-- Atlas Intelligence Runtime V2 — Slice 6
-- Canonical organization/project knowledge and operational project memory.

create schema if not exists knowledge;
revoke all on schema knowledge from public;
revoke all on schema knowledge from anon, authenticated;

create table if not exists knowledge.sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete cascade,
  scope_type text not null
    check (scope_type in ('organization','business_unit','branch','project','agent_pack')),
  scope_id uuid,
  kind text not null,
  external_ref text,
  label text,
  status text not null default 'active'
    check (status in ('active','archived','superseded')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists knowledge.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete cascade,
  source_id uuid not null references knowledge.sources(id) on delete cascade,
  title text not null,
  content text not null,
  fingerprint text not null,
  version integer not null default 1 check (version > 0),
  status text not null default 'active'
    check (status in ('active','archived','superseded')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, fingerprint)
);

create table if not exists knowledge.chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete cascade,
  document_id uuid not null references knowledge.documents(id) on delete cascade,
  ordinal integer not null check (ordinal > 0),
  content text not null,
  char_count integer not null check (char_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(content, ''))
  ) stored,
  created_at timestamptz not null default now(),
  unique (document_id, ordinal)
);

create table if not exists portfolio.project_memories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete cascade,
  project_id uuid not null references portfolio.projects(id) on delete cascade,
  category text not null,
  fact text not null,
  confidence numeric(5,4) not null default 1
    check (confidence >= 0 and confidence <= 1),
  importance integer not null default 50
    check (importance >= 0 and importance <= 100),
  source_ref text,
  status text not null default 'active'
    check (status in ('active','superseded','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_sources_scope_idx
  on knowledge.sources(organization_id, scope_type, scope_id, status);
create index if not exists knowledge_documents_source_idx
  on knowledge.documents(source_id, status, updated_at desc);
create index if not exists knowledge_chunks_document_idx
  on knowledge.chunks(document_id, ordinal);
create index if not exists knowledge_chunks_search_idx
  on knowledge.chunks using gin(search_vector);
create index if not exists project_memories_project_idx
  on portfolio.project_memories(project_id, status, importance desc);

alter table knowledge.sources enable row level security;
alter table knowledge.documents enable row level security;
alter table knowledge.chunks enable row level security;
alter table portfolio.project_memories enable row level security;

drop trigger if exists knowledge_sources_updated_at on knowledge.sources;
create trigger knowledge_sources_updated_at
before update on knowledge.sources
for each row execute function core.set_updated_at();

drop trigger if exists knowledge_documents_updated_at on knowledge.documents;
create trigger knowledge_documents_updated_at
before update on knowledge.documents
for each row execute function core.set_updated_at();

drop trigger if exists project_memories_updated_at on portfolio.project_memories;
create trigger project_memories_updated_at
before update on portfolio.project_memories
for each row execute function core.set_updated_at();

comment on schema knowledge is
  'Atlas canonical organizational and project knowledge; distinct from relationship memory.';
comment on table portfolio.project_memories is
  'Curated operational project facts; not conversational relationship memory.';
