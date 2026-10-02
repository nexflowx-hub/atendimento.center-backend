-- Atlas Internal Group bootstrap v1
-- Apply only after 20261001_atlas_group_os_foundation_v1.sql.
-- Creates operating structure, not legal corporate records.

with org as (
  select id
  from core.organizations
  where slug = 'atlas-internal'
)
insert into core.business_units (
  organization_id,
  code,
  name,
  status,
  mandate,
  metadata
)
select
  org.id,
  x.code,
  x.name,
  'active',
  x.mandate,
  '{"bootstrap":"atlas-internal-org-v1"}'::jsonb
from org
cross join (values
  ('EXEC',     'Executive',            'Group direction, portfolio priorities and executive coordination.'),
  ('TECH',     'Technology',           'Atlas Platform, Atlas Intelligence, engineering and technical architecture.'),
  ('OPS',      'Operations',           'Shared operations, infrastructure, service reliability and administration.'),
  ('COMM',     'Commercial',           'Sales, partnerships and commercial operations.'),
  ('GROWTH',   'Growth',               'Acquisition, experimentation, lifecycle and growth operations.'),
  ('CONTENT',  'Content',              'Content production and digital factory services.'),
  ('RESEARCH', 'Research',             'Research, market intelligence and evidence gathering.'),
  ('FINOPS',   'FinOps',               'Budgets, usage attribution, cost control and unit economics.'),
  ('GOV',      'Governance',           'Policy, approvals, audit and agent governance.')
) as x(code, name, mandate)
on conflict (organization_id, code) do update
set
  name = excluded.name,
  status = excluded.status,
  mandate = excluded.mandate,
  metadata = core.business_units.metadata || excluded.metadata,
  updated_at = now();

with org as (
  select id
  from core.organizations
  where slug = 'atlas-internal'
),
units as (
  select id, code
  from core.business_units
  where organization_id = (select id from org)
)
insert into core.branches (
  organization_id,
  business_unit_id,
  code,
  name,
  kind,
  status,
  mandate,
  metadata
)
select
  org.id,
  units.id,
  x.code,
  x.name,
  'shared_service',
  'active',
  x.mandate,
  '{"bootstrap":"atlas-internal-org-v1"}'::jsonb
from org
join (values
  ('TECH', 'atlas-platform', 'Atlas Platform', 'Build and operate Atlas Group OS, Atlas Intelligence and shared agent infrastructure.'),
  ('OPS',  'atlas-shared-services', 'Atlas Shared Services', 'Operate shared infrastructure, reliability and internal service delivery.')
) as x(unit_code, code, name, mandate) on true
join units on units.code = x.unit_code
on conflict (organization_id, code) do update
set
  business_unit_id = excluded.business_unit_id,
  name = excluded.name,
  kind = excluded.kind,
  status = excluded.status,
  mandate = excluded.mandate,
  metadata = core.branches.metadata || excluded.metadata,
  updated_at = now();

with org as (
  select id
  from core.organizations
  where slug = 'atlas-internal'
),
units as (
  select id, code
  from core.business_units
  where organization_id = (select id from org)
),
branches as (
  select id, code
  from core.branches
  where organization_id = (select id from org)
)
insert into core.teams (
  organization_id,
  business_unit_id,
  branch_id,
  code,
  name,
  status,
  mandate,
  metadata
)
select
  org.id,
  units.id,
  branches.id,
  x.code,
  x.name,
  'active',
  x.mandate,
  '{"bootstrap":"atlas-internal-org-v1"}'::jsonb
from org
join (values
  ('EXEC',     null::text,               'atlas-dg',         'Atlas.DG',         'Executive direction, delegation and portfolio coordination.'),
  ('TECH',     'atlas-platform',         'atlas-dev',        'Atlas.Dev',        'Engineering, architecture and technical delivery.'),
  ('OPS',      'atlas-shared-services',  'atlas-admin',      'Atlas.Admin',      'Infrastructure, administration and operational reliability.'),
  ('COMM',     null::text,               'atlas-sales',      'Atlas.Sales',      'Commercial and sales execution.'),
  ('GROWTH',   null::text,               'atlas-growth',     'Atlas.Growth',     'Growth strategy and acquisition operations.'),
  ('CONTENT',  null::text,               'atlas-content',    'Atlas.Content',    'Content and creative production.'),
  ('RESEARCH', null::text,               'atlas-research',   'Atlas.Research',   'Research and evidence synthesis.'),
  ('FINOPS',   null::text,               'atlas-finops',     'Atlas.FinOps',     'Cost, usage and budget control.'),
  ('GOV',      null::text,               'atlas-governance', 'Atlas.Governance', 'Policy, approvals, audit and safety.')
) as x(unit_code, branch_code, code, name, mandate) on true
join units on units.code = x.unit_code
left join branches on branches.code = x.branch_code
on conflict (organization_id, code) do update
set
  business_unit_id = excluded.business_unit_id,
  branch_id = excluded.branch_id,
  name = excluded.name,
  status = excluded.status,
  mandate = excluded.mandate,
  metadata = core.teams.metadata || excluded.metadata,
  updated_at = now();

with org as (
  select id
  from core.organizations
  where slug = 'atlas-internal'
),
units as (
  select id, code
  from core.business_units
  where organization_id = (select id from org)
),
branches as (
  select id, code
  from core.branches
  where organization_id = (select id from org)
)
insert into portfolio.projects (
  organization_id,
  business_unit_id,
  branch_id,
  code,
  name,
  status,
  owner_type,
  owner_id,
  objective,
  success_criteria,
  risk_level,
  metadata
)
select
  org.id,
  units.id,
  branches.id,
  x.code,
  x.name,
  'active',
  'team',
  x.owner_team,
  x.objective,
  x.success_criteria::jsonb,
  x.risk_level,
  '{"bootstrap":"atlas-internal-org-v1"}'::jsonb
from org
join (values
  (
    'TECH',
    'atlas-platform',
    'ATLAS-GROUP-OS',
    'Atlas Group OS',
    'atlas-dev',
    'Build the Atlas control plane, Runtime V2, governance, memory and executive operating system.',
    '["Runtime V2 foundation operational","Group OS canonical entities operational","Agent actions governed and auditable"]',
    'high'
  ),
  (
    'OPS',
    'atlas-shared-services',
    'ATLAS-HQ-RESET',
    'Atlas HQ Reset',
    'atlas-admin',
    'Consolidate Atlas HQ infrastructure safely while preserving recovery, shared edge and critical services.',
    '["Recovery packages verified","Shared edge extracted","Non-core footprint classified and safely reduced"]',
    'high'
  )
) as x(
  unit_code,
  branch_code,
  code,
  name,
  owner_team,
  objective,
  success_criteria,
  risk_level
) on true
join units on units.code = x.unit_code
join branches on branches.code = x.branch_code
on conflict (organization_id, code) do update
set
  business_unit_id = excluded.business_unit_id,
  branch_id = excluded.branch_id,
  name = excluded.name,
  status = excluded.status,
  owner_type = excluded.owner_type,
  owner_id = excluded.owner_id,
  objective = excluded.objective,
  success_criteria = excluded.success_criteria,
  risk_level = excluded.risk_level,
  metadata = portfolio.projects.metadata || excluded.metadata,
  updated_at = now();

with org as (
  select id
  from core.organizations
  where slug = 'atlas-internal'
)
insert into finops.cost_centers (
  organization_id,
  code,
  name,
  status,
  owner_type,
  owner_id,
  metadata
)
select
  org.id,
  x.code,
  x.name,
  'active',
  'business_unit',
  x.code,
  '{"bootstrap":"atlas-internal-org-v1"}'::jsonb
from org
cross join (values
  ('EXEC', 'Executive'),
  ('TECH', 'Technology'),
  ('OPS', 'Operations'),
  ('COMM', 'Commercial'),
  ('GROWTH', 'Growth'),
  ('CONTENT', 'Content'),
  ('RESEARCH', 'Research'),
  ('FINOPS', 'FinOps'),
  ('GOV', 'Governance')
) as x(code, name)
on conflict (organization_id, code) do update
set
  name = excluded.name,
  status = excluded.status,
  owner_type = excluded.owner_type,
  owner_id = excluded.owner_id,
  metadata = finops.cost_centers.metadata || excluded.metadata,
  updated_at = now();
