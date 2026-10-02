import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Tenant } from '@prisma/client';
import {
  CurrentTenant,
  CurrentUser,
  TenantRoles,
} from '../auth/auth.decorators';
import {
  SupabaseAuthGuard,
  TenantGuard,
  TenantRoleGuard,
} from '../auth/auth.guards';
import type { SupabaseUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { AgentQueueService } from './agent-queue.service';
import { EnqueueRuntimeRunDto } from './execution.dto';

@Controller('runtime/jobs')
@UseGuards(
  SupabaseAuthGuard,
  TenantGuard,
  TenantRoleGuard,
)
export class ExecutionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: AgentQueueService,
  ) {}

  @Post()
  @TenantRoles('owner', 'admin', 'supervisor', 'agent')
  enqueue(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: SupabaseUser,
    @Body() body: EnqueueRuntimeRunDto,
  ) {
    return this.queue.enqueue(
      tenant,
      { type: 'user', id: user.id },
      body,
    );
  }

  @Get(':id')
  async get(
    @CurrentTenant() tenant: Tenant,
    @Param('id') id: string,
  ) {
    const job =
      await this.prisma.executionJob.findFirst({
        where: {
          id,
          tenantId: tenant.id,
        },
      });

    if (!job) {
      throw new NotFoundException(
        'Execution job não encontrado.',
      );
    }

    return job;
  }
}
