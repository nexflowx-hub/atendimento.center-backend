import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type Tenant,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { RuntimeActionService } from '../actions/runtime-action.service';
import { RuntimeRunService } from '../runtime-run.service';
import type { RuntimeActor } from '../runtime.types';
import type { DecideApprovalDto } from './approval.dto';

@Injectable()
export class ApprovalEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actions: RuntimeActionService,
    private readonly runtime: RuntimeRunService,
  ) {}

  async decide(
    tenant: Tenant,
    approvalRequestId: string,
    body: DecideApprovalDto,
    actor: RuntimeActor,
  ) {
    if (!tenant.organizationId) {
      throw new BadRequestException(
        'Tenant sem Organization associada.',
      );
    }

    const decidedAt = new Date();

    const result = await this.prisma.$transaction(
      async (tx) => {
        const request = await tx.approvalRequest.findFirst({
          where: {
            id: approvalRequestId,
            organizationId: tenant.organizationId!,
            tenantId: tenant.id,
          },
        });

        if (!request) {
          throw new NotFoundException(
            'ApprovalRequest não encontrado.',
          );
        }

        if (request.status !== 'pending') {
          throw new BadRequestException(
            `ApprovalRequest já encerrado: ${request.status}`,
          );
        }

        if (
          request.expiresAt &&
          request.expiresAt.getTime() <= decidedAt.getTime()
        ) {
          await tx.approvalRequest.update({
            where: { id: request.id },
            data: {
              status: 'expired',
              decidedAt,
            },
          });

          if (request.actionId) {
            await tx.runtimeAction.updateMany({
              where: {
                id: request.actionId,
                status: 'suspended',
              },
              data: {
                status: 'denied',
                policyResult: 'deny',
                policyReason: 'Approval expired.',
                finishedAt: decidedAt,
              },
            });
          }

          await tx.runtimeStep.updateMany({
            where: {
              runId: request.runId ?? undefined,
              approvalRequestId: request.id,
              kind: 'approval',
              status: 'suspended',
            },
            data: {
              status: 'completed',
              outputSummary: {
                approvalRequestId: request.id,
                decision: 'expired',
              } as Prisma.InputJsonValue,
              completedAt: decidedAt,
            },
          });

          return {
            expired: true as const,
            request,
          };
        }

        if (!request.actionId) {
          throw new BadRequestException(
            'ApprovalRequest sem RuntimeAction associada.',
          );
        }

        const action = await tx.runtimeAction.findFirst({
          where: {
            id: request.actionId,
            status: 'suspended',
          },
        });

        if (!action) {
          throw new BadRequestException(
            'RuntimeAction não está suspensa ou não existe.',
          );
        }

        const run = await tx.runtimeRun.findFirst({
          where: {
            id: action.runId,
            tenantId: tenant.id,
          },
        });

        if (!run) {
          throw new BadRequestException(
            'RuntimeRun não pertence ao tenant atual.',
          );
        }

        await tx.approvalRequest.update({
          where: { id: request.id },
          data: {
            status: body.decision,
            decidedAt,
          },
        });

        await tx.approvalDecision.create({
          data: {
            approvalRequestId: request.id,
            decision: body.decision,
            actorType: actor.type,
            actorId: actor.id,
            reason: body.reason?.trim(),
          },
        });

        await tx.runtimeStep.updateMany({
          where: {
            runId: run.id,
            approvalRequestId: request.id,
            kind: 'approval',
            status: 'suspended',
          },
          data: {
            status: 'completed',
            outputSummary: {
              approvalRequestId: request.id,
              decision: body.decision,
              reason: body.reason?.trim() ?? null,
            } as Prisma.InputJsonValue,
            completedAt: decidedAt,
          },
        });

        if (body.decision === 'denied') {
          await tx.runtimeAction.update({
            where: { id: action.id },
            data: {
              status: 'denied',
              policyResult: 'deny',
              policyReason:
                body.reason?.trim() ??
                'Approval denied by authorized human.',
              finishedAt: decidedAt,
            },
          });
        }

        return {
          expired: false as const,
          request,
          action,
          run,
        };
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    if (result.expired) {
      throw new BadRequestException(
        'ApprovalRequest expirado.',
      );
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        actorId: actor.id,
        action: 'runtime.approval.decided',
        entityType: 'approval_request',
        entityId: result.request.id,
        metadata: {
          decision: body.decision,
          actionId: result.action.id,
          runId: result.run.id,
          reason: body.reason?.trim() ?? null,
        } as Prisma.InputJsonValue,
      },
    });

    await this.prisma.runtimeEvent.create({
      data: {
        runId: result.run.id,
        traceId: result.run.traceId,
        eventType: 'approval.decided',
        actorType: actor.type,
        actorId: actor.id,
        payload: {
          approvalRequestId: result.request.id,
          actionId: result.action.id,
          decision: body.decision,
          reason: body.reason?.trim() ?? null,
        } as Prisma.InputJsonValue,
      },
    });

    if (body.decision === 'denied') {
      return this.runtime.resume(
        tenant,
        result.run.id,
        actor,
      );
    }

    const actionResult =
      await this.actions.resumeApprovedAction(
        tenant,
        result.action.id,
        result.request.id,
        actor,
      );

    if (actionResult.status !== 'completed') {
      return actionResult;
    }

    return this.runtime.resume(
      tenant,
      result.run.id,
      actor,
    );
  }
}
