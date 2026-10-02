-- Atlas Group OS foundation v1
-- Organization structure, portfolio/work graph, governance and FinOps control plane.
-- Apply only to Atlas Platform Core.

create schema if not exists portfolio;
create schema if not exists governance;
create schema if not exists finops;

revoke all on schema portfolio, governance, finops from public;
revoke all on schema portfolio, governance, finops from anon, authenticated;

create table if not exists core.business_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  status text not null default 'active'
    check (status in ('active','paused','archived')),
  mandate text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists core.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete cascade,
  business_unit_id uuid not null references core.business_units(id) on delete cascade,
  code text not null,
  name text not null,
  kind text not null default 'venture'
    check (kind in ('venture','shared_service','client','internal')),
  status text not null default 'active'
    check (status in ('active','paused','frozen','archived')),
  mandate text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists core.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete cascade,
  business_unit_id uuid references core.business_units(id) on delete set null,
  branch_id uuid references core.branches(id) on delete set null,
  code text not null,
  name text not null,
  status text not null default 'active'
    check (status in ('active','paused','archived')),
  mandate text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists core.team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references core.teams(id) on delete cascade,
  member_type text not null check (member_type in ('agent','human')),
  agent_id uuid references ai.agents(id) on delete cascade,
  auth_user_id uuid,
  role text not null default 'member',
  is_manager boolean not null default false,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (member_type = 'agent' and agent_id is not null and auth_user_id is null)
    or
    (member_type = 'human' and auth_user_id is not null and agent_id is null)
  )
);

create unique index if not exists core_team_membership_agent_unique
  on core.team_memberships(team_id, agent_id)
  where agent_id is not null;

create unique index if not exists core_team_membership_human_unique
  on core.team_memberships(team_id, auth_user_id)
  where auth_user_id is not null;

create table if not exists portfolio.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete cascade,
  business_unit_id uuid references core.business_units(id) on delete set null,
  branch_id uuid references core.branches(id) on delete set null,
  code text not null,
  name text not null,
  status text not null default 'planned'
    check (status in ('planned','active','blocked','paused','completed','cancelled','archived')),
  owner_type text,
  owner_id text,
  objective text,
  success_criteria jsonb not null default '[]'::jsonb,
  risk_level text not null default 'medium'
    check (risk_level in ('low','medium','high','critical')),
  started_at timestamptz,
  target_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists portfolio.goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete cascade,
  project_id uuid references portfolio.projects(id) on delete cascade,
  branch_id uuid references core.branches(id) on delete set null,
  parent_goal_id uuid references portfolio.goals(id) on delete set null,
  title text not null,
  status text not null default 'planned'
    check (status in ('planned','active','blocked','achieved','cancelled')),
  priority integer not null default 100,
  success_criteria jsonb not null default '[]'::jsonb,
  owner_type text,
  owner_id text,
  target_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portfolio.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete cascade,
  project_id uuid references portfolio.projects(id) on delete cascade,
  goal_id uuid references portfolio.goals(id) on delete set null,
  parent_task_id uuid references portfolio.tasks(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'backlog'
    check (status in ('backlog','ready','running','blocked','review','completed','cancelled')),
  priority integer not null default 100,
  assignee_type text,
  assignee_id text,
  risk_level text not null default 'low'
    check (risk_level in ('low','medium','high','critical')),
  approval_required boolean not null default false,
  due_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists governance.decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete cascade,
  project_id uuid references portfolio.projects(id) on delete set null,
  task_id uuid references portfolio.tasks(id) on delete set null,
  title text not null,
  proposal text,
  alternatives jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  decision text,
  status text not null default 'proposed'
    check (status in ('proposed','approved','rejected','superseded','cancelled')),
  proposed_by_type text,
  proposed_by_id text,
  decided_by_type text,
  decided_by_id text,
  decided_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists governance.policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references core.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  version integer not null default 1,
  status text not null default 'draft'
    check (status in ('draft','active','retired')),
  scope text not null default 'organization',
  rule jsonb not null default '{}'::jsonb,
  immutable_by_agents boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists governance_policy_global_unique
  on governance.policies(code, version)
  where organization_id is null;

create unique index if not exists governance_policy_org_unique
  on governance.policies(organization_id, code, version)
  where organization_id is not null;

create table if not exists governance.approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete cascade,
  tenant_id uuid references core.tenants(id) on delete set null,
  run_id uuid,
  action_id uuid,
  status text not null default 'pending'
    check (status in ('pending','approved','denied','expired','cancelled')),
  risk_level text not null default 'medium'
    check (risk_level in ('low','medium','high','critical')),
  requested_by_type text not null,
  requested_by_id text,
  approver_class text not null,
  reason text,
  expected_effect text,
  reversibility text,
  policy_ids jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists governance.approval_decisions (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null unique
    references governance.approval_requests(id) on delete cascade,
  decision text not null
    check (decision in ('approved','denied','expired','cancelled')),
  actor_type text not null,
  actor_id text,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists finops.cost_centers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  status text not null default 'active'
    check (status in ('active','paused','archived')),
  owner_type text,
  owner_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists finops.budgets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete cascade,
  cost_center_id uuid references finops.cost_centers(id) on delete set null,
  branch_id uuid references core.branches(id) on delete set null,
  project_id uuid references portfolio.projects(id) on delete set null,
  currency text not null default 'USD',
  amount numeric(18,6) not null check (amount >= 0),
  period_start date not null,
  period_end date not null,
  status text not null default 'active'
    check (status in ('draft','active','closed','cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table if not exists finops.usage_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete cascade,
  tenant_id uuid references core.tenants(id) on delete set null,
  cost_center_id uuid references finops.cost_centers(id) on delete set null,
  project_id uuid references portfolio.projects(id) on delete set null,
  run_id uuid,
  provider text,
  model text,
  usage_type text not null,
  quantity numeric(24,8) not null default 0,
  amount numeric(18,8),
  currency text not null default 'USD',
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists core_business_units_org_idx
  on core.business_units(organization_id, status);
create index if not exists core_branches_unit_idx
  on core.branches(business_unit_id, status);
create index if not exists core_teams_branch_idx
  on core.teams(branch_id, status);
create index if not exists portfolio_projects_org_status_idx
  on portfolio.projects(organization_id, status, updated_at desc);
create index if not exists portfolio_goals_project_status_idx
  on portfolio.goals(project_id, status, priority);
create index if not exists portfolio_tasks_project_status_idx
  on portfolio.tasks(project_id, status, priority);
create index if not exists governance_decisions_project_time_idx
  on governance.decisions(project_id, created_at desc);
create index if not exists governance_approval_queue_idx
  on governance.approval_requests(status, risk_level, created_at);
create index if not exists finops_budgets_org_period_idx
  on finops.budgets(organization_id, period_start, period_end);
create index if not exists finops_usage_org_time_idx
  on finops.usage_records(organization_id, occurred_at desc);
create index if not exists finops_usage_run_idx
  on finops.usage_records(run_id)
  where run_id is not null;

alter table core.business_units enable row level security;
alter table core.branches enable row level security;
alter table core.teams enable row level security;
alter table core.team_memberships enable row level security;
alter table portfolio.projects enable row level security;
alter table portfolio.goals enable row level security;
alter table portfolio.tasks enable row level security;
alter table governance.decisions enable row level security;
alter table governance.policies enable row level security;
alter table governance.approval_requests enable row level security;
alter table governance.approval_decisions enable row level security;
alter table finops.cost_centers enable row level security;
alter table finops.budgets enable row level security;
alter table finops.usage_records enable row level security;

do $$
declare item record;
begin
  for item in select * from (values
    ('core.business_units','business_units_updated_at'),
    ('core.branches','branches_updated_at'),
    ('core.teams','teams_updated_at'),
    ('core.team_memberships','team_memberships_updated_at'),
    ('portfolio.projects','portfolio_projects_updated_at'),
    ('portfolio.goals','portfolio_goals_updated_at'),
    ('portfolio.tasks','portfolio_tasks_updated_at'),
    ('governance.decisions','governance_decisions_updated_at'),
    ('governance.policies','governance_policies_updated_at'),
    ('governance.approval_requests','governance_approval_requests_updated_at'),
    ('finops.cost_centers','finops_cost_centers_updated_at'),
    ('finops.budgets','finops_budgets_updated_at')
  ) as v(table_name, trigger_name)
  loop
    execute format('drop trigger if exists %I on %s', item.trigger_name, item.table_name);
    execute format(
      'create trigger %I before update on %s for each row execute function core.set_updated_at()',
      item.trigger_name,
      item.table_name
    );
  end loop;
end $$;

comment on schema portfolio is
  'Atlas Group OS projects, goals and tasks.';
comment on schema governance is
  'Atlas constitutional policy, approvals and durable decisions.';
comment on schema finops is
  'Atlas operational budgets, cost centers and usage attribution; not legal accounting.';
