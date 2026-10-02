import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Tenant } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import type {
  CreateDecisionDto,
  CreateGoalDto,
  CreateProjectDto,
  CreateTaskDto,
  UpdateTaskStatusDto,
} from './group-os.dto';

@Injectable()
export class GroupOsService {
  constructor(private readonly prisma: PrismaService) {}

  async structure(tenant: Tenant) {
    const organizationId = this.organizationId(tenant);

    const [businessUnits, branches, teams] = await Promise.all([
      this.prisma.businessUnit.findMany({
        where: { organizationId },
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.branch.findMany({
        where: { organizationId },
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.team.findMany({
        where: { organizationId },
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
      }),
    ]);

    return {
      organizationId,
      businessUnits,
      branches,
      teams,
    };
  }

  listProjects(tenant: Tenant) {
    return this.prisma.portfolioProject.findMany({
      where: { organizationId: this.organizationId(tenant) },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  async getProject(tenant: Tenant, id: string) {
    const organizationId = this.organizationId(tenant);
    const project = await this.prisma.portfolioProject.findFirst({
      where: { id, organizationId },
    });

    if (!project) {
      throw new NotFoundException('Projeto não encontrado.');
    }

    const [goals, tasks, decisions] = await Promise.all([
      this.prisma.portfolioGoal.findMany({
        where: { projectId: project.id, organizationId },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.portfolioTask.findMany({
        where: { projectId: project.id, organizationId },
        orderBy: [{ status: 'asc' }, { priority: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.governanceDecision.findMany({
        where: { projectId: project.id, organizationId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      project,
      goals,
      tasks,
      decisions,
    };
  }

  async createProject(
    tenant: Tenant,
    body: CreateProjectDto,
    actorId: string,
  ) {
    const organizationId = this.organizationId(tenant);

    let businessUnitId = body.businessUnitId;
    if (businessUnitId) {
      await this.requireBusinessUnit(organizationId, businessUnitId);
    }

    let branchId = body.branchId;
    if (branchId) {
      const branch = await this.requireBranch(organizationId, branchId);
      if (businessUnitId && branch.businessUnitId !== businessUnitId) {
        throw new BadRequestException(
          'branchId não pertence à businessUnitId informada.',
        );
      }
      businessUnitId = businessUnitId ?? branch.businessUnitId;
    }

    const project = await this.prisma.portfolioProject.create({
      data: {
        organizationId,
        businessUnitId,
        branchId,
        code: body.code.trim().toUpperCase(),
        name: body.name.trim(),
        status: 'planned',
        ownerType: 'human',
        ownerId: actorId,
        objective: body.objective?.trim(),
        successCriteria: (body.successCriteria ?? []) as Prisma.InputJsonValue,
        riskLevel: body.riskLevel ?? 'medium',
        metadata: (body.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    await this.audit(tenant.id, actorId, 'group_os.project.created', 'project', project.id, {
      organizationId,
      code: project.code,
    });

    return project;
  }

  async createGoal(
    tenant: Tenant,
    projectId: string,
    body: CreateGoalDto,
    actorId: string,
  ) {
    const organizationId = this.organizationId(tenant);
    const project = await this.requireProject(organizationId, projectId);

    if (body.branchId) {
      await this.requireBranch(organizationId, body.branchId);
    }

    if (body.parentGoalId) {
      const parent = await this.prisma.portfolioGoal.findFirst({
        where: {
          id: body.parentGoalId,
          organizationId,
          projectId: project.id,
        },
      });
      if (!parent) {
        throw new BadRequestException(
          'parentGoalId não pertence ao mesmo projeto.',
        );
      }
    }

    const goal = await this.prisma.portfolioGoal.create({
      data: {
        organizationId,
        projectId: project.id,
        branchId: body.branchId ?? project.branchId,
        parentGoalId: body.parentGoalId,
        title: body.title.trim(),
        status: 'planned',
        priority: body.priority ?? 100,
        successCriteria: (body.successCriteria ?? []) as Prisma.InputJsonValue,
        ownerType: 'human',
        ownerId: actorId,
        targetAt: body.targetAt ? new Date(body.targetAt) : undefined,
        metadata: (body.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    await this.audit(tenant.id, actorId, 'group_os.goal.created', 'goal', goal.id, {
      organizationId,
      projectId: project.id,
    });

    return goal;
  }

  async createTask(
    tenant: Tenant,
    body: CreateTaskDto,
    actorId: string,
  ) {
    const organizationId = this.organizationId(tenant);

    let projectId = body.projectId;
    if (projectId) {
      await this.requireProject(organizationId, projectId);
    }

    if (body.goalId) {
      const goal = await this.prisma.portfolioGoal.findFirst({
        where: { id: body.goalId, organizationId },
      });
      if (!goal) {
        throw new BadRequestException('goalId inválido para esta organização.');
      }
      if (projectId && goal.projectId && goal.projectId !== projectId) {
        throw new BadRequestException(
          'goalId e projectId pertencem a projetos diferentes.',
        );
      }
      projectId = projectId ?? goal.projectId ?? undefined;
    }

    if (body.parentTaskId) {
      const parent = await this.prisma.portfolioTask.findFirst({
        where: { id: body.parentTaskId, organizationId },
      });
      if (!parent) {
        throw new BadRequestException(
          'parentTaskId inválido para esta organização.',
        );
      }
      if (projectId && parent.projectId && parent.projectId !== projectId) {
        throw new BadRequestException(
          'parentTaskId e projectId pertencem a projetos diferentes.',
        );
      }
      projectId = projectId ?? parent.projectId ?? undefined;
    }

    const task = await this.prisma.portfolioTask.create({
      data: {
        organizationId,
        projectId,
        goalId: body.goalId,
        parentTaskId: body.parentTaskId,
        title: body.title.trim(),
        description: body.description?.trim(),
        status: 'backlog',
        priority: body.priority ?? 100,
        assigneeType: 'human',
        assigneeId: actorId,
        riskLevel: body.riskLevel ?? 'low',
        approvalRequired: body.approvalRequired ?? false,
        dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
        metadata: (body.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    await this.audit(tenant.id, actorId, 'group_os.task.created', 'task', task.id, {
      organizationId,
      projectId: task.projectId,
      goalId: task.goalId,
    });

    return task;
  }

  async updateTaskStatus(
    tenant: Tenant,
    id: string,
    body: UpdateTaskStatusDto,
    actorId: string,
  ) {
    const organizationId = this.organizationId(tenant);
    const task = await this.prisma.portfolioTask.findFirst({
      where: { id, organizationId },
    });

    if (!task) {
      throw new NotFoundException('Tarefa não encontrada.');
    }

    const updated = await this.prisma.portfolioTask.update({
      where: { id: task.id },
      data: { status: body.status },
    });

    await this.audit(
      tenant.id,
      actorId,
      'group_os.task.status_changed',
      'task',
      task.id,
      {
        from: task.status,
        to: body.status,
      },
    );

    return updated;
  }

  async createDecision(
    tenant: Tenant,
    body: CreateDecisionDto,
    actorId: string,
  ) {
    const organizationId = this.organizationId(tenant);

    let projectId = body.projectId;
    if (projectId) {
      await this.requireProject(organizationId, projectId);
    }

    if (body.taskId) {
      const task = await this.prisma.portfolioTask.findFirst({
        where: { id: body.taskId, organizationId },
      });
      if (!task) {
        throw new BadRequestException('taskId inválido para esta organização.');
      }
      if (
        projectId &&
        task.projectId &&
        projectId !== task.projectId
      ) {
        throw new BadRequestException(
          'taskId e projectId pertencem a projetos diferentes.',
        );
      }
      projectId = projectId ?? task.projectId ?? undefined;
    }

    const decision = await this.prisma.governanceDecision.create({
      data: {
        organizationId,
        projectId,
        taskId: body.taskId,
        title: body.title.trim(),
        proposal: body.proposal?.trim(),
        alternatives: (body.alternatives ?? []) as Prisma.InputJsonValue,
        risks: (body.risks ?? []) as Prisma.InputJsonValue,
        status: 'proposed',
        proposedByType: 'human',
        proposedById: actorId,
        metadata: (body.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    await this.audit(
      tenant.id,
      actorId,
      'group_os.decision.proposed',
      'decision',
      decision.id,
      {
        organizationId,
        projectId: decision.projectId,
        taskId: decision.taskId,
      },
    );

    return decision;
  }

  listPendingApprovals(tenant: Tenant) {
    return this.prisma.approvalRequest.findMany({
      where: {
        organizationId: this.organizationId(tenant),
        status: 'pending',
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private organizationId(tenant: Tenant): string {
    if (!tenant.organizationId) {
      throw new BadRequestException(
        'Tenant sem Organization associada; Group OS indisponível.',
      );
    }
    return tenant.organizationId;
  }

  private async requireBusinessUnit(
    organizationId: string,
    id: string,
  ) {
    const item = await this.prisma.businessUnit.findFirst({
      where: { id, organizationId },
    });
    if (!item) {
      throw new BadRequestException(
        'businessUnitId inválido para esta organização.',
      );
    }
    return item;
  }

  private async requireBranch(
    organizationId: string,
    id: string,
  ) {
    const item = await this.prisma.branch.findFirst({
      where: { id, organizationId },
    });
    if (!item) {
      throw new BadRequestException(
        'branchId inválido para esta organização.',
      );
    }
    return item;
  }

  private async requireProject(
    organizationId: string,
    id: string,
  ) {
    const item = await this.prisma.portfolioProject.findFirst({
      where: { id, organizationId },
    });
    if (!item) {
      throw new BadRequestException(
        'projectId inválido para esta organização.',
      );
    }
    return item;
  }

  private audit(
    tenantId: string,
    actorId: string,
    action: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    return this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId,
        action,
        entityType,
        entityId,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }
}
