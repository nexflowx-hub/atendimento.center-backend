import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  Job,
  Worker,
} from 'bullmq';
import { PrismaService } from '../database/prisma.service';
import { RuntimeRunService } from '../runtime/runtime-run.service';
import type { StartRuntimeRunDto } from '../runtime/runtime.dto';
import type { RuntimeActor } from '../runtime/runtime.types';
import { ATLAS_QUEUES } from './queue-names';
import { createAtlasRedis } from './redis-connection';

type AgentQueuePayload = {
  executionJobId: string;
};

type StoredRequest = StartRuntimeRunDto;

@Injectable()
export class AgentExecutionWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger =
    new Logger(AgentExecutionWorkerService.name);

  private worker?: Worker<AgentQueuePayload>;
  private connection?: ReturnType<
    typeof createAtlasRedis
  >;

  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: RuntimeRunService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.connection = createAtlasRedis(this.config);

    const configuredConcurrency = Number(this.config.get<string>('ATLAS_AGENT_WORKER_CONCURRENCY') ?? 1);
    const concurrency = Number.isFinite(configuredConcurrency) ? Math.max(
      1,
      Math.min(
        4,
        Math.floor(configuredConcurrency),
      ),
    ) : 1;

    this.worker = new Worker<AgentQueuePayload>(
      ATLAS_QUEUES.agent,
      (job) => this.process(job),
      {
        connection: this.connection,
        concurrency,
      },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.error(
        'atlas.agent failed job=' +
          String(job?.id ?? 'unknown') +
          ': ' +
          error.message,
      );
    });
    this.worker.on('error', () => this.logger.error('Atlas agent queue connection error'));

    this.logger.log(
      'Atlas agent worker listening; concurrency=' +
        String(concurrency),
    );
  }

  private async process(
    job: Job<AgentQueuePayload>,
  ) {
    const execution =
      await this.prisma.executionJob.findUnique({
        where: {
          id: job.data.executionJobId,
        },
      });

    if (!execution) {
      throw new Error(
        'ExecutionJob not found: ' +
          job.data.executionJobId,
      );
    }

    if (execution.status === 'completed') {
      return {
        executionJobId: execution.id,
        runId: execution.runId,
        status: execution.status,
      };
    }

    const claim =
      await this.prisma.executionJob.updateMany({
        where: {
          id: execution.id,
          status: 'queued',
        },
        data: {
          status: 'running',
          startedAt: new Date(),
          attempts: {
            increment: 1,
          },
          errorMessage: null,
        },
      });

    if (!claim.count) {
      throw new Error(
        'ExecutionJob not claimable: ' +
          execution.id,
      );
    }

    try {
      const tenant =
        await this.prisma.tenant.findUnique({
          where: {
            id: execution.tenantId,
          },
        });

      if (!tenant) {
        throw new Error(
          'Tenant not found for ExecutionJob ' +
            execution.id,
        );
      }

      const request =
        this.readRequest(execution.request);

      const actor: RuntimeActor = {
        type: this.actorType(
          execution.actorType,
        ),
        id: execution.actorId,
      };

      const result = await this.runtime.start(
        tenant,
        actor,
        request,
      );

      await this.prisma.executionJob.update({
        where: {
          id: execution.id,
        },
        data: {
          status: 'completed',
          runId: result.runId,
          finishedAt: new Date(),
          metadata: {
            queueJobId: String(job.id),
            runtimeStatus: result.status,
          } as Prisma.InputJsonValue,
        },
      });

      return {
        executionJobId: execution.id,
        runId: result.runId,
        runtimeStatus: result.status,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      await this.prisma.executionJob.update({
        where: {
          id: execution.id,
        },
        data: {
          status: 'failed',
          errorMessage: message,
          finishedAt: new Date(),
        },
      });

      throw error;
    }
  }

  private readRequest(
    value: Prisma.JsonValue,
  ): StoredRequest {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      throw new Error(
        'ExecutionJob request inválido.',
      );
    }

    const raw =
      value as Record<string, unknown>;

    if (
      typeof raw.agentCode !== 'string' ||
      typeof raw.input !== 'string'
    ) {
      throw new Error(
        'ExecutionJob request incompleto.',
      );
    }

    return {
      agentCode: raw.agentCode,
      input: raw.input,
      ...(typeof raw.model === 'string'
        ? {
            model: raw.model,
          }
        : {}),
      ...(raw.metadata &&
      typeof raw.metadata === 'object' &&
      !Array.isArray(raw.metadata)
        ? {
            metadata:
              raw.metadata as Record<
                string,
                unknown
              >,
          }
        : {}),
    };
  }

  private actorType(
    value: string,
  ): RuntimeActor['type'] {
    if (
      value === 'user' ||
      value === 'service' ||
      value === 'agent'
    ) {
      return value;
    }

    return 'service';
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.connection?.quit();
  }
}
