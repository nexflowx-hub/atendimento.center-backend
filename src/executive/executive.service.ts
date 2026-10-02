import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type Tenant,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { ExecutiveDelegationDto } from './executive.dto';

@Injectable()
export class ExecutiveService {
  constructor(private readonly prisma: PrismaService) {}

  async brief(tenant: Tenant) {
    const organizationId = this.organizationId(tenant);
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 30);

    const [
      businessUnits,
      branches,
      teams,
      projects,
      tasks,
      pendingApprovals,
      proposedDecisions,
      activeAgents,
      packAssignments,
      recentRuns,
      recentExecutionJobs,
      activeBudgets,
      usage,
      pendingApprovalCount,
      proposedDecisionCount,
      runCounts,
      executionJobCounts,
    ] = await Promise.all([
      this.prisma.businessUnit.findMany({
        where: {
          organizationId,
          status: 'active',
        },
        select: {
          id: true,
          code: true,
          name: true,
        },
        orderBy: { code: 'asc' },
      }),
      this.prisma.branch.findMany({
        where: {
          organizationId,
          status: { in: ['active', 'paused', 'frozen'] },
        },
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          businessUnitId: true,
        },
        orderBy: { code: 'asc' },
      }),
      this.prisma.team.findMany({
        where: {
          organizationId,
          status: 'active',
        },
        select: {
          id: true,
          code: true,
          name: true,
          branchId: true,
        },
        orderBy: { code: 'asc' },
      }),
      this.prisma.portfolioProject.findMany({
        where: { organizationId },
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          riskLevel: true,
          branchId: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.portfolioTask.findMany({
        where: {
          organizationId,
          status: {
            in: [
              'backlog',
              'ready',
              'running',
              'blocked',
              'review',
            ],
          },
        },
        select: {
          id: true,
          projectId: true,
          goalId: true,
          title: true,
          status: true,
          priority: true,
          riskLevel: true,
          assigneeType: true,
          assigneeId: true,
          dueAt: true,
        },
        orderBy: [
          { status: 'asc' },
          { priority: 'asc' },
          { createdAt: 'asc' },
        ],
      }),
      this.prisma.approvalRequest.findMany({
        where: {
          organizationId,
          status: 'pending',
        },
        orderBy: { createdAt: 'asc' },
        take: 50,
      }),
      this.prisma.governanceDecision.findMany({
        where: {
          organizationId,
          status: 'proposed',
        },
        orderBy: { createdAt: 'asc' },
        take: 50,
      }),
      this.prisma.agent.findMany({
        where: {
          tenantId: tenant.id,
          enabled: true,
        },
        select: {
          id: true,
          code: true,
          name: true,
          provider: true,
          model: true,
        },
        orderBy: { code: 'asc' },
      }),
      this.prisma.agentPackAssignment.findMany({
        where: {
          tenantId: tenant.id,
          status: 'active',
        },
      }),
      this.prisma.runtimeRun.findMany({
        where: {
          tenantId: tenant.id,
          createdAt: { gte: since },
        },
        select: {
          id: true,
          agentId: true,
          status: true,
          provider: true,
          model: true,
          costUsd: true,
          inputTokens: true,
          outputTokens: true,
          createdAt: true,
          finishedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      this.prisma.executionJob.findMany({
        where: {
          tenantId: tenant.id,
          createdAt: { gte: since },
        },
        select: {
          id: true,
          queueName: true,
          jobType: true,
          status: true,
          runId: true,
          attempts: true,
          createdAt: true,
          finishedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      this.prisma.budget.findMany({
        where: {
          organizationId,
          status: 'active',
        },
        orderBy: { periodEnd: 'asc' },
      }),
      this.prisma.usageRecord.groupBy({
        by: ['currency'],
        where: {
          organizationId,
          occurredAt: { gte: since },
        },
        _sum: {
          amount: true,
          quantity: true,
        },
      }),
      this.prisma.approvalRequest.count({ where: { organizationId, status: 'pending' } }),
      this.prisma.governanceDecision.count({ where: { organizationId, status: 'proposed' } }),
      this.prisma.runtimeRun.groupBy({
        by: ['status'],
        where: { tenantId: tenant.id, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.executionJob.groupBy({
        by: ['status'],
        where: { tenantId: tenant.id, createdAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      organizationId,
      period: {
        usageSince: since.toISOString(),
      },
      structure: {
        businessUnits,
        branches,
        teams,
      },
      portfolio: {
        projectCounts:
          this.countBy(projects, 'status'),
        projects,
        openTaskCounts:
          this.countBy(tasks, 'status'),
        tasks,
      },
      governance: {
        pendingApprovalCount,
        proposedDecisionCount,
        pendingApprovals,
        proposedDecisions,
      },
      workforce: {
        activeAgentCount:
          activeAgents.length,
        activeAgents,
        packAssignments,
      },
      runtime: {
        recentRuns,
        runCounts: Object.fromEntries(runCounts.map(item => [item.status, item._count._all])),
        recentExecutionJobs,
        executionJobCounts: Object.fromEntries(executionJobCounts.map(item => [item.status, item._count._all])),
      },
      finops: {
        activeBudgets,
        usage30d: usage,
      },
    };
  }

  async decisionQueue(tenant: Tenant) {
    const organizationId = this.organizationId(tenant);

    const [approvals, decisions] =
      await Promise.all([
        this.prisma.approvalRequest.findMany({
          where: {
            organizationId,
            status: 'pending',
          },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.governanceDecision.findMany({
          where: {
            organizationId,
            status: 'proposed',
          },
          orderBy: { createdAt: 'asc' },
        }),
      ]);

    return {
      organizationId,
      approvals,
      decisions,
    };
  }

  async delegate(
    tenant: Tenant,
    actorId: string,
    body: ExecutiveDelegationDto,
  ) {
    const organizationId = this.organizationId(tenant);

    const project =
      await this.prisma.portfolioProject.findFirst({
        where: {
          id: body.projectId,
          organizationId,
        },
      });

    if (!project) {
      throw new NotFoundException(
        'Projeto não encontrado.',
      );
    }

    if (body.goalId) {
      const goal =
        await this.prisma.portfolioGoal.findFirst({
          where: {
            id: body.goalId,
            organizationId,
            projectId: project.id,
          },
        });

      if (!goal) {
        throw new BadRequestException(
          'Goal não pertence ao projeto.',
        );
      }
    }

    await this.validateAssignee(
      tenant,
      organizationId,
      body.assigneeType,
      body.assigneeId,
    );

    const riskLevel =
      body.riskLevel ?? 'low';

    const task =
      await this.prisma.portfolioTask.create({
        data: {
          organizationId,
          projectId: project.id,
          goalId: body.goalId,
          title: body.title.trim(),
          description:
            body.description?.trim(),
          status: 'ready',
          priority: 100,
          assigneeType:
            body.assigneeType,
          assigneeId:
            body.assigneeId,
          riskLevel,
          approvalRequired:
            body.approvalRequired ??
            ['high', 'critical'].includes(
              riskLevel,
            ),
          metadata: {
            source: 'atlas-executive',
            delegatedBy: actorId,
          } as Prisma.InputJsonValue,
        },
      });

    await this.prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        actorId,
        action:
          'atlas_executive.task.delegated',
        entityType: 'task',
        entityId: task.id,
        metadata: {
          organizationId,
          projectId: project.id,
          goalId: body.goalId ?? null,
          assigneeType:
            body.assigneeType,
          assigneeId:
            body.assigneeId,
          riskLevel,
        } as Prisma.InputJsonValue,
      },
    });

    return task;
  }

  private async validateAssignee(
    tenant: Tenant,
    organizationId: string,
    type: 'team' | 'agent',
    id: string,
  ) {
    if (type === 'team') {
      const team = await this.prisma.team.findFirst({
        where: {
          id,
          organizationId,
          status: 'active',
        },
      });

      if (!team) {
        throw new BadRequestException(
          'Team não pertence à organização.',
        );
      }
      return;
    }

    const agent = await this.prisma.agent.findFirst({
      where: {
        id,
        tenantId: tenant.id,
        enabled: true,
      },
    });

    if (!agent) {
      throw new BadRequestException(
        'Agent não pertence ao tenant atual.',
      );
    }
  }

  private organizationId(tenant: Tenant): string {
    if (!tenant.organizationId) {
      throw new BadRequestException(
        'Tenant sem Organization associada.',
      );
    }
    return tenant.organizationId;
  }

  private countBy<T extends Record<string, unknown>>(
    items: T[],
    key: keyof T,
  ): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const item of items) {
      const value = String(item[key] ?? 'unknown');
      counts[value] =
        (counts[value] ?? 0) + 1;
    }

    return counts;
  }
}
