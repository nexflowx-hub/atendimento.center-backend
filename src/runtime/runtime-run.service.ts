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
import { RuntimeActionService } from './actions/runtime-action.service';
import { ModelGateway } from './model/model-gateway.service';
import type {
  ModelMessage,
  ModelToolDefinition,
  ModelUsage,
} from './model/model.types';
import type { StartRuntimeRunDto } from './runtime.dto';
import type {
  RuntimeActor,
  RuntimeRunResult,
  RuntimeUsageSummary,
} from './runtime.types';
import { ToolRegistryService } from './tools/tool-registry.service';

const MAX_MODEL_TURNS = 4;

type PendingToolCall = {
  toolCallId: string;
  toolCode: string;
  actionId: string;
  approvalRequestId: string;
};

type RuntimeContinuationState = {
  messages: ModelMessage[];
  turn: number;
  usage: RuntimeUsageSummary;
  pendingToolCall?: PendingToolCall;
};

@Injectable()
export class RuntimeRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly models: ModelGateway,
    private readonly registry: ToolRegistryService,
    private readonly actions: RuntimeActionService,
  ) {}

  async start(
    tenant: Tenant,
    actor: RuntimeActor,
    body: StartRuntimeRunDto,
  ): Promise<RuntimeRunResult> {
    const agent = await this.prisma.agent.findFirst({
      where: {
        tenantId: tenant.id,
        code: body.agentCode.trim().toLowerCase(),
        enabled: true,
      },
    });

    if (!agent) {
      throw new NotFoundException(
        'Agente ativo não encontrado.',
      );
    }

    const agentVersion =
      await this.prisma.agentVersion.findFirst({
        where: { agentId: agent.id },
        orderBy: { version: 'desc' },
      });

    const messages: ModelMessage[] = [
      ...(agent.systemPrompt
        ? [
            {
              role: 'system' as const,
              content: agent.systemPrompt,
            },
          ]
        : []),
      {
        role: 'user',
        content: body.input,
      },
    ];

    const state: RuntimeContinuationState = {
      messages,
      turn: 0,
      usage: this.emptyUsage(),
    };

    const run = await this.prisma.runtimeRun.create({
      data: {
        organizationId: tenant.organizationId,
        tenantId: tenant.id,
        agentId: agent.id,
        agentVersionId: agentVersion?.id,
        actorType: actor.type,
        actorId: actor.id,
        triggerType: 'api',
        status: 'running',
        provider: agent.provider,
        model: body.model ?? agent.model,
        input: {
          content: body.input,
        } as Prisma.InputJsonValue,
        state: this.toJson(state),
        metadata:
          (body.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    await this.event(
      run.id,
      run.traceId,
      'run.started',
      actor,
      {
        agentId: agent.id,
        agentVersionId: agentVersion?.id ?? null,
        provider: agent.provider,
        model: body.model ?? agent.model,
      },
    );

    await this.prisma.runtimeStep.create({
      data: {
        runId: run.id,
        ordinal: 1,
        kind: 'context',
        status: 'completed',
        inputSummary: {
          tenantId: tenant.id,
          agentId: agent.id,
          agentVersionId: agentVersion?.id ?? null,
          inputChars: body.input.length,
        } as Prisma.InputJsonValue,
        outputSummary: {
          systemPromptChars: agent.systemPrompt.length,
        } as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });

    return this.executeLoop(
      tenant,
      run.id,
      {
        type: 'agent',
        id: agent.id,
      },
    );
  }

  async resume(
    tenant: Tenant,
    runId: string,
    actor: RuntimeActor,
  ): Promise<RuntimeRunResult> {
    const run = await this.prisma.runtimeRun.findFirst({
      where: {
        id: runId,
        tenantId: tenant.id,
      },
    });

    if (!run) {
      throw new NotFoundException('Run não encontrado.');
    }

    if (run.status !== 'suspended') {
      throw new BadRequestException(
        `Run não está suspensa: ${run.status}`,
      );
    }

    const state = this.readState(run.state);
    const pending = state.pendingToolCall;

    if (!pending) {
      throw new BadRequestException(
        'Run suspensa sem pending tool call.',
      );
    }

    const action = await this.prisma.runtimeAction.findFirst({
      where: {
        id: pending.actionId,
        runId: run.id,
      },
    });

    if (!action) {
      return this.failRun(
        run.id,
        run.traceId,
        actor,
        'Pending RuntimeAction não encontrada.',
      );
    }

    if (action.status === 'suspended') {
      return this.suspendedResult(run, state);
    }

    if (action.status === 'denied') {
      return this.cancelRun(
        run.id,
        run.traceId,
        actor,
        action.policyReason ??
          'Pending action was denied.',
      );
    }

    if (action.status === 'failed') {
      return this.failRun(
        run.id,
        run.traceId,
        actor,
        action.errorMessage ??
          'Pending action failed.',
      );
    }

    if (action.status !== 'completed') {
      throw new BadRequestException(
        `Pending RuntimeAction não está pronta: ${action.status}`,
      );
    }

    state.messages.push({
      role: 'tool',
      toolCallId: pending.toolCallId,
      content: this.stringifyToolResult(action.output),
    });
    delete state.pendingToolCall;

    const claim = await this.prisma.runtimeRun.updateMany({
      where: { id: run.id, tenantId: tenant.id, status: 'suspended' },
      data: {
        status: 'running',
        state: this.toJson(state),
      },
    });
    if (!claim.count) {
      throw new BadRequestException('Run continuation already claimed.');
    }

    await this.event(
      run.id,
      run.traceId,
      'run.resumed',
      actor,
      {
        actionId: action.id,
        approvalRequestId:
          action.approvalRequestId ?? null,
      },
    );

    return this.executeLoop(
      tenant,
      run.id,
      {
        type: 'agent',
        id: run.agentId,
      },
    );
  }

  async get(tenant: Tenant, runId: string) {
    const run = await this.prisma.runtimeRun.findFirst({
      where: {
        id: runId,
        tenantId: tenant.id,
      },
    });

    if (!run) {
      throw new NotFoundException('Run não encontrado.');
    }

    const [steps, actions, events] = await Promise.all([
      this.prisma.runtimeStep.findMany({
        where: { runId: run.id },
        orderBy: { ordinal: 'asc' },
      }),
      this.prisma.runtimeAction.findMany({
        where: { runId: run.id },
        orderBy: { proposedAt: 'asc' },
      }),
      this.prisma.runtimeEvent.findMany({
        where: { runId: run.id },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return {
      run,
      steps,
      actions,
      events,
    };
  }

  private async executeLoop(
    tenant: Tenant,
    runId: string,
    modelActor: RuntimeActor,
  ): Promise<RuntimeRunResult> {
    while (true) {
      const run = await this.prisma.runtimeRun.findFirst({
        where: {
          id: runId,
          tenantId: tenant.id,
        },
      });

      if (!run) {
        throw new NotFoundException('Run não encontrado.');
      }

      if (run.status !== 'running') {
        throw new BadRequestException(
          `Run não executável: ${run.status}`,
        );
      }

      const agent = await this.prisma.agent.findFirst({
        where: {
          id: run.agentId,
          tenantId: tenant.id,
          enabled: true,
        },
      });

      if (!agent) {
        return this.failRun(
          run.id,
          run.traceId,
          modelActor,
          'Agente deixou de estar ativo durante a Run.',
        );
      }

      const state = this.readState(run.state);

      if (state.turn >= MAX_MODEL_TURNS) {
        return this.failRun(
          run.id,
          run.traceId,
          modelActor,
          `Maximum model turns exceeded (${MAX_MODEL_TURNS}).`,
        );
      }

      const granted =
        await this.registry.listGranted(
          run.tenantId,
          run.agentId,
        );

      const tools: ModelToolDefinition[] =
        this.models.supports(agent.provider, 'tools')
          ? granted.map((tool) => ({
              code: tool.code,
              description: tool.description,
              inputSchema: tool.inputSchema,
            }))
          : [];

      const ordinal = await this.nextOrdinal(run.id);
      const turn = state.turn + 1;

      const modelStep =
        await this.prisma.runtimeStep.create({
          data: {
            runId: run.id,
            ordinal,
            kind: 'model',
            status: 'running',
            provider: agent.provider,
            model: run.model ?? agent.model,
            inputSummary: {
              turn,
              messageCount: state.messages.length,
              visibleTools: tools.map((tool) => tool.code),
            } as Prisma.InputJsonValue,
          },
        });

      const modelStarted = Date.now();

      try {
        const response = await this.models.generate({
          provider: agent.provider,
          model: run.model ?? agent.model,
          messages: state.messages,
          temperature:
            agent.temperature === null
              ? undefined
              : Number(agent.temperature),
          tools,
          toolChoice: tools.length ? 'auto' : 'none',
          metadata: {
            runId: run.id,
            traceId: run.traceId,
            tenantId: tenant.id,
            agentId: agent.id,
            turn,
          },
        });

        if (response.toolCalls.length > 1) {
          throw new Error(
            'Runtime V2 Slice 4 accepts at most one tool call per model turn.',
          );
        }

        state.turn = turn;
        state.usage = this.addUsage(
          state.usage,
          response.usage,
        );

        state.messages.push({
          role: 'assistant',
          content: response.content || null,
          ...(response.toolCalls.length
            ? { toolCalls: response.toolCalls }
            : {}),
        });

        await this.prisma.runtimeStep.update({
          where: { id: modelStep.id },
          data: {
            status: 'completed',
            provider: response.provider,
            model: response.model,
            outputSummary: {
              outputChars: response.content.length,
              stopReason: response.stopReason,
              toolCalls: response.toolCalls.map(
                (call) => ({
                  id: call.id,
                  name: call.name,
                }),
              ),
            } as Prisma.InputJsonValue,
            inputTokens: response.usage.inputTokens,
            outputTokens: response.usage.outputTokens,
            costUsd: response.usage.costUsd,
            latencyMs: response.latencyMs,
            completedAt: new Date(),
          },
        });

        await this.event(
          run.id,
          run.traceId,
          'step.completed',
          modelActor,
          {
            stepId: modelStep.id,
            ordinal,
            kind: 'model',
            turn,
            provider: response.provider,
            model: response.model,
            toolCalls: response.toolCalls.map(
              (call) => call.name,
            ),
          },
        );

        if (!response.toolCalls.length) {
          return this.completeRun(
            run,
            state,
            response.provider,
            response.model,
            response.content,
            modelActor,
          );
        }

        const call = response.toolCalls[0];

        await this.prisma.runtimeRun.update({
          where: { id: run.id },
          data: {
            state: this.toJson(state),
            provider: response.provider,
            model: response.model,
            inputTokens: state.usage.inputTokens,
            outputTokens: state.usage.outputTokens,
            costUsd: state.usage.costUsd,
            latencyMs:
              Date.now() - run.startedAt.getTime(),
          },
        });

        const actionResult =
          await this.actions.proposeAndExecute(
            tenant,
            run.id,
            call.name,
            call.arguments,
            {
              type: 'agent',
              id: agent.id,
            },
          );

        if (actionResult.status === 'suspended') {
          if (!actionResult.approvalRequestId) {
            throw new Error(
              'Suspended action missing approvalRequestId.',
            );
          }

          state.pendingToolCall = {
            toolCallId: call.id,
            toolCode: call.name,
            actionId: actionResult.actionId,
            approvalRequestId:
              actionResult.approvalRequestId,
          };

          await this.prisma.runtimeRun.update({
            where: { id: run.id },
            data: {
              status: 'suspended',
              state: this.toJson(state),
              inputTokens: state.usage.inputTokens,
              outputTokens: state.usage.outputTokens,
              costUsd: state.usage.costUsd,
              latencyMs:
                Date.now() - run.startedAt.getTime(),
            },
          });

          await this.event(
            run.id,
            run.traceId,
            'run.suspended',
            modelActor,
            {
              actionId: actionResult.actionId,
              approvalRequestId:
                actionResult.approvalRequestId,
              toolCode: call.name,
            },
          );

          return this.suspendedResult(
            {
              ...run,
              provider: response.provider,
              model: response.model,
              latencyMs:
                Date.now() - run.startedAt.getTime(),
            },
            state,
          );
        }

        state.messages.push({
          role: 'tool',
          toolCallId: call.id,
          content: this.stringifyToolResult(
            actionResult.output,
          ),
        });

        await this.prisma.runtimeRun.update({
          where: { id: run.id },
          data: {
            state: this.toJson(state),
            provider: response.provider,
            model: response.model,
            inputTokens: state.usage.inputTokens,
            outputTokens: state.usage.outputTokens,
            costUsd: state.usage.costUsd,
            latencyMs:
              Date.now() - run.startedAt.getTime(),
          },
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        await this.prisma.runtimeStep.updateMany({
          where: {
            id: modelStep.id,
            status: 'running',
          },
          data: {
            status: 'failed',
            errorMessage: message,
            latencyMs: Date.now() - modelStarted,
            completedAt: new Date(),
          },
        });

        return this.failRun(
          run.id,
          run.traceId,
          modelActor,
          message,
        );
      }
    }
  }

  private async completeRun(
    run: {
      id: string;
      traceId: string;
      startedAt: Date;
    },
    state: RuntimeContinuationState,
    provider: string,
    model: string,
    content: string,
    actor: RuntimeActor,
  ): Promise<RuntimeRunResult> {
    const ordinal = await this.nextOrdinal(run.id);
    const latencyMs =
      Date.now() - run.startedAt.getTime();

    await this.prisma.$transaction([
      this.prisma.runtimeStep.create({
        data: {
          runId: run.id,
          ordinal,
          kind: 'response',
          status: 'completed',
          outputSummary: {
            outputChars: content.length,
          } as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      }),
      this.prisma.runtimeRun.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          provider,
          model,
          output: {
            content,
          } as Prisma.InputJsonValue,
          state: this.toJson(state),
          inputTokens: state.usage.inputTokens,
          outputTokens: state.usage.outputTokens,
          costUsd: state.usage.costUsd,
          latencyMs,
          finishedAt: new Date(),
        },
      }),
    ]);

    await this.event(
      run.id,
      run.traceId,
      'run.completed',
      actor,
      {
        provider,
        model,
        turns: state.turn,
        latencyMs,
      },
    );

    return {
      runId: run.id,
      traceId: run.traceId,
      status: 'completed',
      provider,
      model,
      content,
      usage: state.usage,
      latencyMs,
    };
  }

  private async cancelRun(
    runId: string,
    traceId: string,
    actor: RuntimeActor,
    reason: string,
  ): Promise<RuntimeRunResult> {
    await this.prisma.runtimeRun.update({
      where: { id: runId },
      data: {
        status: 'cancelled',
        output: {
          reason,
        } as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });

    await this.event(
      runId,
      traceId,
      'run.cancelled',
      actor,
      { reason },
    );

    return {
      runId,
      traceId,
      status: 'cancelled',
      reason,
    };
  }

  private async failRun(
    runId: string,
    traceId: string,
    actor: RuntimeActor,
    reason: string,
  ): Promise<RuntimeRunResult> {
    await this.prisma.runtimeRun.update({
      where: { id: runId },
      data: {
        status: 'failed',
        errorMessage: reason,
        finishedAt: new Date(),
      },
    });

    await this.event(
      runId,
      traceId,
      'run.failed',
      actor,
      { error: reason },
    );

    return {
      runId,
      traceId,
      status: 'failed',
      reason,
    };
  }

  private suspendedResult(
    run: {
      id: string;
      traceId: string;
      provider: string | null;
      model: string | null;
      latencyMs: number | null;
      startedAt?: Date;
    },
    state: RuntimeContinuationState,
  ): RuntimeRunResult {
    const pending = state.pendingToolCall;

    return {
      runId: run.id,
      traceId: run.traceId,
      status: 'suspended',
      provider: run.provider,
      model: run.model,
      pendingApprovals: pending
        ? [
            {
              approvalRequestId:
                pending.approvalRequestId,
              actionId: pending.actionId,
              toolCode: pending.toolCode,
            },
          ]
        : [],
      usage: state.usage,
      latencyMs:
        run.latencyMs ??
        (run.startedAt
          ? Date.now() - run.startedAt.getTime()
          : 0),
    };
  }

  private readState(
    value: Prisma.JsonValue,
  ): RuntimeContinuationState {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      throw new BadRequestException(
        'Runtime continuation state inválido.',
      );
    }

    const raw =
      value as unknown as RuntimeContinuationState;

    if (
      !Array.isArray(raw.messages) ||
      !Number.isInteger(raw.turn) ||
      !raw.usage
    ) {
      throw new BadRequestException(
        'Runtime continuation state incompleto.',
      );
    }

    return raw;
  }

  private emptyUsage(): RuntimeUsageSummary {
    return {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: null,
    };
  }

  private addUsage(
    current: RuntimeUsageSummary,
    next: ModelUsage,
  ): RuntimeUsageSummary {
    const costUsd =
      current.costUsd === null &&
      next.costUsd === null
        ? null
        : (current.costUsd ?? 0) +
          (next.costUsd ?? 0);

    return {
      inputTokens:
        current.inputTokens + next.inputTokens,
      outputTokens:
        current.outputTokens + next.outputTokens,
      totalTokens:
        current.totalTokens + next.totalTokens,
      costUsd,
    };
  }

  private stringifyToolResult(value: unknown): string {
    try {
      return JSON.stringify(value ?? null);
    } catch {
      return JSON.stringify({
        error:
          'Tool result could not be serialized.',
      });
    }
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(
      JSON.stringify(value ?? null),
    ) as Prisma.InputJsonValue;
  }

  private async nextOrdinal(
    runId: string,
  ): Promise<number> {
    const max =
      await this.prisma.runtimeStep.aggregate({
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
}
