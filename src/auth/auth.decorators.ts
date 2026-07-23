import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Tenant } from '@prisma/client';
import type { AuthenticatedHttpRequest, SupabaseUser } from './auth.types';

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
