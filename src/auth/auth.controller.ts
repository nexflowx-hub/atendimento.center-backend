import { Controller, Get, UseGuards } from '@nestjs/common';
import type { Tenant } from '@prisma/client';
import { CurrentTenant, CurrentUser } from './auth.decorators';
import { SupabaseAuthGuard, TenantGuard } from './auth.guards';
import type { SupabaseUser } from './auth.types';

@Controller('me')
@UseGuards(SupabaseAuthGuard, TenantGuard)
export class AuthController {
  @Get()
  me(
    @CurrentUser() user: SupabaseUser,
    @CurrentTenant() tenant: Tenant,
  ): Record<string, unknown> {
    return {
      success: true,
      user: {
        id: user.id,
        email: user.email ?? null,
        name:
          (user.user_metadata?.full_name as string | undefined) ??
          (user.user_metadata?.name as string | undefined) ??
          user.email ??
          'Utilizador',
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
      },
    };
  }
}
