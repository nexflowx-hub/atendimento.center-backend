-- Applied to Atlas Platform Core as configure_verified_smm_endpoints_v1.
-- Endpoints confirmed from public provider API documentation on 2026-09-28.

update smm.providers
set base_url='https://justanotherpanel.com/api/v2',
    metadata=metadata || '{"endpointSource":"public_api_docs","endpointVerifiedAt":"2026-09-28"}'::jsonb
where code='jap';

update smm.providers
set base_url='https://revendaexclusiva.com/api/v2',
    metadata=metadata || '{"endpointSource":"public_api_docs","endpointVerifiedAt":"2026-09-28"}'::jsonb
where code='revenda-exclusiva';
