import { Controller, Get, Headers, UseGuards } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CurrentUser } from './auth.decorators';
import { SupabaseAuthGuard } from './auth.guards';
import type { SupabaseUser } from './auth.types';

@Controller('me')
@UseGuards(SupabaseAuthGuard)
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async me(
    @CurrentUser() user: SupabaseUser,
    @Headers('x-tenant-slug') requestedSlug?: string,
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
        tenant: {
          include: {
            organization: true,
            entitlements: {
              where: { status: { in: ['active', 'trial'] } },
              orderBy: { capability: 'asc' },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const selected =
      (requestedSlug
        ? memberships.find((membership) => membership.tenant.slug === requestedSlug.trim())
        : undefined) ?? memberships[0] ?? null;

    return {
      success: true,
      onboardingRequired: memberships.length === 0,
      user: {
        id: user.id,
        email: user.email ?? null,
        name:
          (user.user_metadata?.full_name as string | undefined) ??
          (user.user_metadata?.name as string | undefined) ??
          user.email ??
          'Utilizador',
      },
      tenant: selected
        ? {
            id: selected.tenant.id,
            name: selected.tenant.name,
            slug: selected.tenant.slug,
            product: selected.tenant.product,
            status: selected.tenant.status,
            plan: selected.tenant.plan,
            role: selected.role,
            organization: selected.tenant.organization
              ? {
                  id: selected.tenant.organization.id,
                  name: selected.tenant.organization.name,
                  slug: selected.tenant.organization.slug,
                }
              : null,
            capabilities: selected.tenant.entitlements.map((item) => item.capability),
          }
        : null,
      tenants: memberships.map((membership) => ({
        id: membership.tenant.id,
        name: membership.tenant.name,
        slug: membership.tenant.slug,
        product: membership.tenant.product,
        status: membership.tenant.status,
        plan: membership.tenant.plan,
        role: membership.role,
        capabilities: membership.tenant.entitlements.map((item) => item.capability),
      })),
    };
  }
}
