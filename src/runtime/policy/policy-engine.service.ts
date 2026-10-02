import { Injectable } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import { PrismaService } from '../../database/prisma.service';
import type {
  ActionEnvelope,
  PolicyDecision,
} from '../actions/action-envelope.types';
import { ToolAuthorizationService } from '../tools/tool-authorization.service';
import { ToolRegistryService } from '../tools/tool-registry.service';

@Injectable()
export class PolicyEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ToolRegistryService,
    private readonly authorization: ToolAuthorizationService,
  ) {}

  async evaluate(
    envelope: ActionEnvelope,
    options: { approvalRequestId?: string } = {},
  ): Promise<PolicyDecision> {
    const tool = this.registry.resolve(envelope.tool);

    if (
      envelope.toolVersion !== tool.definition.version ||
      envelope.capability !== tool.definition.capability ||
      envelope.sideEffect !== tool.definition.sideEffect ||
      envelope.risk !== tool.definition.defaultRisk
    ) {
      return { result: 'deny', policyIds: ['tool.definition.integrity'], reason: 'ActionEnvelope does not match the registered tool.' };
    }

    const persistedDefinition =
      await this.prisma.toolDefinitionRecord.findFirst({
        where: {
          code: tool.definition.code,
          version: tool.definition.version,
          enabled: true,
        },
      });

    if (!persistedDefinition) {
      return {
        result: 'deny',
        policyIds: ['tool.registered.enabled'],
        reason: 'Tool definition is disabled or unavailable.',
      };
    }

    if (
      persistedDefinition.capability !== tool.definition.capability ||
      persistedDefinition.sideEffect !== tool.definition.sideEffect ||
      persistedDefinition.defaultRisk !== tool.definition.defaultRisk
    ) {
      return { result: 'deny', policyIds: ['tool.definition.persisted_integrity'], reason: 'Persisted tool definition does not match the runtime definition.' };
    }

    const authorized =
      await this.authorization.isAuthorized(
        envelope.target.tenantId,
        envelope.requestedBy.agentId,
        envelope.tool,
      );

    if (!authorized) {
      return {
        result: 'deny',
        policyIds: ['tool.authorization.required'],
        reason:
          'Agent does not have an active manual grant or approved Agent Pack authorization for this tool.',
      };
    }

    if (envelope.sideEffect !== 'none') {
      if (!envelope.target.organizationId) {
        return { result: 'deny', policyIds: ['organization.required_for_side_effect'], reason: 'Side-effect actions require Organization context.' };
      }

      if (options.approvalRequestId) {
        const approval = await this.prisma.approvalRequest.findFirst({
          where: {
            id: options.approvalRequestId,
            organizationId: envelope.target.organizationId,
            tenantId: envelope.target.tenantId,
            runId: envelope.runId,
            actionId: envelope.id,
            status: 'approved',
          },
        });
        if (!approval) {
          return { result: 'deny', policyIds: ['approval.approved.required'], reason: 'Approved request does not match this action/run/tenant.' };
        }
        if (approval.expiresAt && approval.expiresAt.getTime() <= Date.now()) {
          return { result: 'deny', policyIds: ['approval.not_expired'], reason: 'Approval has expired.' };
        }
        if (!isDeepStrictEqual(approval.payload, {
          toolCode: envelope.tool,
          toolVersion: envelope.toolVersion,
          capability: envelope.capability,
          input: envelope.input,
        })) {
          return { result: 'deny', policyIds: ['approval.payload.integrity'], reason: 'Action input or definition changed after approval was requested.' };
        }
        const decision = await this.prisma.approvalDecision.findFirst({
          where: { approvalRequestId: approval.id, decision: 'approved', actorType: 'user' },
        });
        if (!decision) {
          return { result: 'deny', policyIds: ['approval.decision.persisted'], reason: 'No persisted human approval decision exists.' };
        }
        return {
          result: 'allow',
          policyIds: ['tool.registered.enabled', 'tool.authorization.required', 'tool.side_effect.approval', 'approval.approved.required', 'approval.not_expired', 'approval.decision.persisted'],
        };
      }
      return {
        result: 'approval_required',
        policyIds: ['tool.side_effect.approval'],
        reason:
          'Side-effect tools require durable approval before execution.',
      };
    }

    return {
      result: 'allow',
      policyIds: [
        'tool.registered.enabled',
        'tool.authorization.required',
        'tool.read_only.allowed',
      ],
    };
  }
}
