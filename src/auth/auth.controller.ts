import { Controller, Get, UseGuards } from '@nestjs/common';
import type { Tenant } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CurrentTenant, CurrentUser } from './auth.decorators';
import { SupabaseAuthGuard, TenantGuard } from './auth.guards';
import type { SupabaseUser } from './auth.types';

@Controller('me')
@UseGuards(SupabaseAuthGuard, TenantGuard)
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async me(
    @CurrentUser() user: SupabaseUser,
    @CurrentTenant() tenant: Tenant,
  ): Promise<Record<string, unknown>> {
    const memberships = await this.prisma.tenantUser.findMany({
      where: {
        authUserId: user.id,
        active: true,
        tenant: {
          status: {
            in: ['trial', 'active'],
          },
        },
      },
      include: {
        tenant: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

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
      tenants: memberships.map((membership) => ({
        id: membership.tenant.id,
        name: membership.tenant.name,
        slug: membership.tenant.slug,
        status: membership.tenant.status,
        role: membership.role,
      })),
    };
  }
}
