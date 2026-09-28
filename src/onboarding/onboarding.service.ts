import { Injectable } from '@nestjs/common';
import type { SupabaseUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { CreateWorkspaceDto } from './onboarding.dto';
import { randomUUID } from 'crypto';

const CAPABILITIES: Record<string, string[]> = {
  growth: ['crm', 'smm'],
  engage: ['crm', 'omnichannel', 'ai_agents', 'flows', 'automation'],
  signals: ['social_intelligence'],
};

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async createWorkspace(user: SupabaseUser, body: CreateWorkspaceDto) {
    const product = body.product ?? 'growth';

    const existing = await this.prisma.tenantUser.findFirst({
      where: {
        authUserId: user.id,
        active: true,
        tenant: {
          product,
          status: { in: ['trial', 'active'] },
          organization: {
            kind: 'customer',
          },
        },
      },
      include: {
        tenant: {
          include: {
            organization: true,
            entitlements: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (existing) {
      return {
        created: false,
        tenant: serializeTenant(existing.tenant, existing.role),
      };
    }

    const organizationName = body.organizationName.trim();
    const workspaceName = body.workspaceName?.trim() || organizationName;
    const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
    const baseSlug = slugify(workspaceName) || 'workspace';
    const organizationSlug = `${slugify(organizationName) || 'org'}-${suffix}`;
    const tenantSlug = `${baseSlug}-${suffix}`;
    const capabilities = CAPABILITIES[product] ?? [];

    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          slug: organizationSlug,
          name: organizationName,
          kind: 'customer',
          status: 'trial',
          metadata: {
            onboardedFrom: product,
            ownerAuthUserId: user.id,
          },
        },
      });

      const tenant = await tx.tenant.create({
        data: {
          organizationId: organization.id,
          name: workspaceName,
          slug: tenantSlug,
          product,
          status: 'trial',
          plan: 'trial',
          metadata: {
            onboardingVersion: 1,
          },
        },
      });

      const membership = await tx.tenantUser.create({
        data: {
          tenantId: tenant.id,
          authUserId: user.id,
          role: 'owner',
          active: true,
          metadata: {
            onboardingVersion: 1,
          },
        },
      });

      if (capabilities.length) {
        await tx.entitlement.createMany({
          data: capabilities.map((capability) => ({
            tenantId: tenant.id,
            capability,
            status: 'trial',
            metadata: {
              source: 'self_service_onboarding',
            },
          })),
          skipDuplicates: true,
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorId: user.id,
          action: 'workspace.created',
          entityType: 'tenant',
          entityId: tenant.id,
          metadata: {
            product,
            organizationId: organization.id,
          },
        },
      });

      const createdTenant = await tx.tenant.findUniqueOrThrow({
        where: { id: tenant.id },
        include: {
          organization: true,
          entitlements: true,
        },
      });

      return {
        created: true,
        tenant: serializeTenant(createdTenant, membership.role),
      };
    });
  }
}

function serializeTenant(
  tenant: {
    id: string;
    name: string;
    slug: string;
    product: string;
    status: string;
    plan: string;
    organization: { id: string; name: string; slug: string } | null;
    entitlements: Array<{ capability: string; status: string }>;
  },
  role: string,
) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    product: tenant.product,
    status: tenant.status,
    plan: tenant.plan,
    role,
    organization: tenant.organization,
    capabilities: tenant.entitlements
      .filter((item) => ['active', 'trial'].includes(item.status))
      .map((item) => item.capability)
      .sort(),
  };
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}
