import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Tenant, TenantUser } from '@prisma/client';
import type { AuthenticatedHttpRequest, SupabaseUser } from './auth.types';

export const TENANT_ROLES_KEY = 'tenant_roles';

export const TenantRoles = (...roles: string[]) =>
  SetMetadata(TENANT_ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SupabaseUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedHttpRequest>();
    return request.user as SupabaseUser;
  },
);

export const CurrentTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Tenant => {
    const request = context.switchToHttp().getRequest<AuthenticatedHttpRequest>();
    return request.tenant as Tenant;
  },
);

export const CurrentMembership = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedHttpRequest>();
    return request.membership as TenantUser;
  },
);
