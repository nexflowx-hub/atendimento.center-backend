import type { Tenant, TenantUser } from '@prisma/client';

export interface SupabaseUser {
  id: string;
  email?: string | null;
  phone?: string | null;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}

export interface AuthenticatedHttpRequest {
  headers: {
    authorization?: string;
    'x-tenant-slug'?: string;
  };
  user?: SupabaseUser;
  tenant?: Tenant;
  membership?: TenantUser;
}
