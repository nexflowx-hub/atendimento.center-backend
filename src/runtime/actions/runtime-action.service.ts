import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Tenant } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { PolicyEngineService } from '../policy/policy-engine.service';
import type { RuntimeActor } from '../runtime.types';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { ToolRunnerService } from '../tools/tool-runner.service';
import type {
  ActionEnvelope,
  PolicyDecision,
} from './action-envelope.types';

@Injectable()
export class RuntimeActionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ToolRegistryService,
    private readonly policy: PolicyEngineService,
    private readonly runner: ToolRunnerService,
  ) {}

  async proposeAndExecute(
    tenant: Tenant,
    runId: string,
    toolCode: string,
    input: unknown,
    initiatedBy: RuntimeActor,
  ) {
    const run = await this.prisma.runtimeRun.findFirst({
      where: {
        id: runId,
        tenantId: tenant.id,
      },
    });

    if (!run) {
      throw new NotFoundException('Run não encontrado.');
    }

    const tool = this.registry.resolve(toolCode);
    const validatedInput = tool.validate(input);
    const ordinal = await this.nextOrdinal(run.id);

    const proposalStep = await this.prisma.runtimeStep.create({
      data: {
        runId: run.id,
        ordinal,
        kind: 'tool_proposal',
        status: 'completed',
        toolCode: tool.definition.code,
        inputSummary: {
          toolCode: tool.definition.code,
          input: validatedInput,
        } as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });

    const envelope: ActionEnvelope = {
      id: randomUUID(),
      runId: run.id,
      stepId: proposalStep.id,
      tool: tool.definition.code,
      toolVersion: tool.definition.version,
      capability: tool.definition.capability,
      input: validatedInput,
      sideEffect: tool.definition.sideEffect,
      risk: tool.definition.defaultRisk,
      requestedBy: {
        agentId: run.agentId,
        agentVersionId: run.agentVersionId,
      },
      target: {
        organizationId: run.organizationId,
        tenantId: run.tenantId,
      },
      approval: {
        required: tool.definition.sideEffect !== 'none',
        policyIds: [],
      },
      timeoutMs: tool.definition.timeoutMs,
    };

    const action = await this.prisma.runtimeAction.create({
      data: {
        id: envelope.id,
        runId: run.id,
        stepId: proposalStep.id,
        toolCode: envelope.tool,
        toolVersion: envelope.toolVersion,
        capability: envelope.capability,
        input: envelope.input as Prisma.InputJsonValue,
        sideEffect: envelope.sideEffect,
        risk: envelope.risk,
        status: 'proposed',
      },
    });

    await this.event(
      run.id,
      run.traceId,
      'tool.proposed',
      initiatedBy,
      {
        actionId: action.id,
        toolCode: envelope.tool,
        capability: envelope.capability,
        sideEffect: envelope.sideEffect,
        risk: envelope.risk,
      },
    );

    const policyDecision =
      await this.policy.evaluate(envelope);

    await this.recordPolicy(
      run.id,
      envelope,
      policyDecision,
    );

    if (policyDecision.result === 'deny') {
      await this.denyAction(
        action.id,
        policyDecision.reason,
      );
      throw new ForbiddenException(policyDecision.reason);
    }

    if (policyDecision.result === 'approval_required') {
      return this.suspendForApproval(
        tenant,
        run,
        action.id,
        envelope,
        policyDecision,
        initiatedBy,
        tool.definition.description,
      );
    }

    await this.prisma.runtimeAction.update({
      where: { id: action.id },
      data: {
        policyResult: 'allow',
        policyReason: null,
        status: 'allowed',
      },
    });

    return this.executeAllowedAction(
      run,
      action.id,
      envelope,
      policyDecision,
      initiatedBy,
    );
  }

  async resumeApprovedAction(
    tenant: Tenant,
    actionId: string,
    approvalRequestId: string,
    initiatedBy: RuntimeActor,
  ) {
    const action = await this.prisma.runtimeAction.findFirst({
      where: {
        id: actionId,
        status: 'suspended',
        approvalRequestId,
      },
    });

    if (!action) {
      throw new NotFoundException(
        'RuntimeAction suspensa não encontrada.',
      );
    }

    const run = await this.prisma.runtimeRun.findFirst({
      where: {
        id: action.runId,
        tenantId: tenant.id,
      },
    });

    if (!run) {
      throw new NotFoundException(
        'RuntimeRun não encontrado neste tenant.',
      );
    }

    if (!action.stepId) {
      throw new BadRequestException(
        'RuntimeAction sem proposal step.',
      );
    }

    const tool = this.registry.resolve(action.toolCode);

    if (
      action.toolVersion !== tool.definition.version ||
      action.capability !== tool.definition.capability ||
      action.sideEffect !== tool.definition.sideEffect ||
      action.risk !== tool.definition.defaultRisk
    ) {
      await this.denyAction(
        action.id,
        'Registered tool definition changed after approval request.',
      );
      throw new ForbiddenException(
        'Tool definition changed; a new action proposal is required.',
      );
    }

    const validatedInput = tool.validate(action.input);

    const envelope: ActionEnvelope = {
      id: action.id,
      runId: run.id,
      stepId: action.stepId,
      tool: tool.definition.code,
      toolVersion: tool.definition.version,
      capability: tool.definition.capability,
      input: validatedInput,
      sideEffect: tool.definition.sideEffect,
      risk: tool.definition.defaultRisk,
      requestedBy: {
        agentId: run.agentId,
        agentVersionId: run.agentVersionId,
      },
      target: {
        organizationId: run.organizationId,
        tenantId: run.tenantId,
      },
      approval: {
        required: true,
        policyIds: [],
        approvalRequestId,
      },
      idempotencyKey: action.idempotencyKey ?? undefined,
      timeoutMs: tool.definition.timeoutMs,
    };

    const policyDecision =
      await this.policy.evaluate(
        envelope,
        { approvalRequestId },
      );

    await this.recordPolicy(
      run.id,
      envelope,
      policyDecision,
    );

    if (policyDecision.result !== 'allow') {
      const reason =
        'reason' in policyDecision
          ? policyDecision.reason
          : 'Approved action failed policy re-check.';

      await this.denyAction(action.id, reason);

      await this.event(
        run.id,
        run.traceId,
        'approval.execution_denied',
        initiatedBy,
        {
          approvalRequestId,
          actionId: action.id,
          policyResult: policyDecision.result,
          reason,
        },
      );

      throw new ForbiddenException(reason);
    }

    const claim = await this.prisma.runtimeAction.updateMany({
      where: { id: action.id, status: 'suspended', approvalRequestId },
      data: {
        policyResult: 'allow',
        policyReason: null,
        status: 'allowed',
      },
    });

    if (!claim.count) {
      throw new BadRequestException('Approved action already claimed.');
    }

    await this.event(
      run.id,
      run.traceId,
      'action.resumed',
      initiatedBy,
      {
        approvalRequestId,
        actionId: action.id,
      },
    );

    return this.executeAllowedAction(
      run,
      action.id,
      envelope,
      policyDecision,
      initiatedBy,
    );
  }

  private async suspendForApproval(
    tenant: Tenant,
    run: {
      id: string;
      traceId: string;
      organizationId: string | null;
      tenantId: string;
      agentId: string;
    },
    actionId: string,
    envelope: ActionEnvelope,
    decision: Extract<
      PolicyDecision,
      { result: 'approval_required' }
    >,
    initiatedBy: RuntimeActor,
    toolDescription: string,
  ) {
    if (!run.organizationId) {
      const reason =
        'Side-effect action requires Organization context.';
      await this.denyAction(actionId, reason);
      throw new ForbiddenException(reason);
    }

    const approvalOrdinal = await this.nextOrdinal(run.id);
    const expiresAt = new Date(
      Date.now() + 24 * 60 * 60 * 1000,
    );

    const approval = await this.prisma.$transaction(
      async (tx) => {
        const created = await tx.approvalRequest.create({
          data: {
            organizationId: run.organizationId!,
            tenantId: tenant.id,
            runId: run.id,
            actionId,
            status: 'pending',
            riskLevel: envelope.risk,
            requestedByType: 'agent',
            requestedById: run.agentId,
            approverClass: 'owner_or_admin',
            reason: decision.reason,
            expectedEffect: toolDescription,
            reversibility: envelope.sideEffect,
            policyIds:
              decision.policyIds as Prisma.InputJsonValue,
            payload: {
              toolCode: envelope.tool,
              toolVersion: envelope.toolVersion,
              capability: envelope.capability,
              input: envelope.input,
            } as Prisma.InputJsonValue,
            expiresAt,
          },
        });

        await tx.runtimeAction.update({
          where: { id: actionId },
          data: {
            policyResult: 'approval_required',
            policyReason: decision.reason,
            status: 'suspended',
            approvalRequestId: created.id,
          },
        });

        await tx.runtimeStep.create({
          data: {
            runId: run.id,
            ordinal: approvalOrdinal,
            kind: 'approval',
            status: 'suspended',
            toolCode: envelope.tool,
            approvalRequestId: created.id,
            inputSummary: {
              actionId,
              risk: envelope.risk,
              sideEffect: envelope.sideEffect,
            } as Prisma.InputJsonValue,
            outputSummary: {
              approvalRequestId: created.id,
              approverClass: created.approverClass,
              expiresAt: created.expiresAt?.toISOString() ?? null,
            } as Prisma.InputJsonValue,
          },
        });

        return created;
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    await this.event(
      run.id,
      run.traceId,
      'approval.required',
      initiatedBy,
      {
        approvalRequestId: approval.id,
        actionId,
        toolCode: envelope.tool,
        risk: envelope.risk,
        approverClass: approval.approverClass,
      },
    );

    return {
      actionId,
      approvalRequestId: approval.id,
      status: 'suspended' as const,
      policy: decision,
    };
  }

  private async executeAllowedAction(
    run: {
      id: string;
      traceId: string;
      organizationId: string | null;
      tenantId: string;
      agentId: string;
    },
    actionId: string,
    envelope: ActionEnvelope,
    policyDecision: Extract<
      PolicyDecision,
      { result: 'allow' }
    >,
    initiatedBy: RuntimeActor,
  ) {
    const executionOrdinal = await this.nextOrdinal(run.id);

    const executionStep = await this.prisma.runtimeStep.create({
      data: {
        runId: run.id,
        ordinal: executionOrdinal,
        kind: 'tool_execution',
        status: 'running',
        toolCode: envelope.tool,
        inputSummary: {
          actionId,
          toolCode: envelope.tool,
        } as Prisma.InputJsonValue,
      },
    });

    const started = Date.now();

    await this.prisma.runtimeAction.update({
      where: { id: actionId },
      data: {
        status: 'running',
        startedAt: new Date(),
      },
    });

    await this.event(
      run.id,
      run.traceId,
      'tool.started',
      initiatedBy,
      {
        actionId,
        stepId: executionStep.id,
        toolCode: envelope.tool,
      },
    );

    try {
      const result = await this.runner.execute(
        envelope,
        {
          organizationId: run.organizationId,
          tenantId: run.tenantId,
          agentId: run.agentId,
          runId: run.id,
          traceId: run.traceId,
        },
        policyDecision,
      );

      const output = this.toJson(result);

      await this.prisma.$transaction([
        this.prisma.runtimeStep.update({
          where: { id: executionStep.id },
          data: {
            status: 'completed',
            outputSummary: {
              actionId,
              output,
            } as Prisma.InputJsonValue,
            latencyMs: Date.now() - started,
            completedAt: new Date(),
          },
        }),
        this.prisma.runtimeAction.update({
          where: { id: actionId },
          data: {
            status: 'completed',
            output,
            finishedAt: new Date(),
          },
        }),
      ]);

      await this.event(
        run.id,
        run.traceId,
        'tool.completed',
        initiatedBy,
        {
          actionId,
          stepId: executionStep.id,
          toolCode: envelope.tool,
          latencyMs: Date.now() - started,
        },
      );

      return {
        actionId,
        status: 'completed' as const,
        policy: policyDecision,
        output: result,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      await this.prisma.$transaction([
        this.prisma.runtimeStep.update({
          where: { id: executionStep.id },
          data: {
            status: 'failed',
            errorMessage: message,
            latencyMs: Date.now() - started,
            completedAt: new Date(),
          },
        }),
        this.prisma.runtimeAction.update({
          where: { id: actionId },
          data: {
            status: 'failed',
            errorMessage: message,
            finishedAt: new Date(),
          },
        }),
      ]);

      await this.event(
        run.id,
        run.traceId,
        'tool.failed',
        initiatedBy,
        {
          actionId,
          stepId: executionStep.id,
          toolCode: envelope.tool,
          error: message,
        },
      );

      throw error;
    }
  }

  private async recordPolicy(
    runId: string,
    envelope: ActionEnvelope,
    decision: PolicyDecision,
  ) {
    const ordinal = await this.nextOrdinal(runId);

    await this.prisma.runtimeStep.create({
      data: {
        runId,
        ordinal,
        kind: 'policy',
        status: 'completed',
        toolCode: envelope.tool,
        inputSummary: {
          actionId: envelope.id,
          toolCode: envelope.tool,
          sideEffect: envelope.sideEffect,
          risk: envelope.risk,
        } as Prisma.InputJsonValue,
        outputSummary: {
          decision: decision.result,
          policyIds: decision.policyIds,
          ...('reason' in decision
            ? { reason: decision.reason }
            : {}),
        } as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });
  }

  private denyAction(
    actionId: string,
    reason: string,
  ) {
    return this.prisma.runtimeAction.update({
      where: { id: actionId },
      data: {
        policyResult: 'deny',
        policyReason: reason,
        status: 'denied',
        finishedAt: new Date(),
      },
    });
  }

  private async nextOrdinal(runId: string): Promise<number> {
    const max = await this.prisma.runtimeStep.aggregate({
      where: { runId },
      _max: { ordinal: true },
    });
    return (max._max.ordinal ?? 0) + 1;
  }

  private event(
    runId: string,
    traceId: string,
    eventType: string,
    actor: RuntimeActor,
    payload: Record<string, unknown>,
  ) {
    return this.prisma.runtimeEvent.create({
      data: {
        runId,
        traceId,
        eventType,
        actorType: actor.type,
        actorId: actor.id,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(
      JSON.stringify(value ?? null),
    ) as Prisma.InputJsonValue;
  }
}
