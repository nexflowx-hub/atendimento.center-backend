import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
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
import {
  CreateProjectMemoryDto,
  IngestKnowledgeDocumentDto,
} from './knowledge.dto';
import { KnowledgeService } from './knowledge.service';

@Controller('group-os')
@UseGuards(
  SupabaseAuthGuard,
  TenantGuard,
  TenantRoleGuard,
)
export class KnowledgeController {
  constructor(
    private readonly knowledge: KnowledgeService,
  ) {}

  @Post('knowledge/documents')
  @TenantRoles('owner', 'admin', 'supervisor')
  ingest(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: SupabaseUser,
    @Body() body: IngestKnowledgeDocumentDto,
  ) {
    return this.knowledge.ingest(
      tenant,
      body,
      user.id,
    );
  }

  @Get('knowledge/search')
  search(
    @CurrentTenant() tenant: Tenant,
    @Query('q') q: string,
    @Query('scopeType') scopeType?: string,
    @Query('scopeId') scopeId?: string,
    @Query('limit') rawLimit?: string,
  ) {
    const parsed = rawLimit
      ? Number.parseInt(rawLimit, 10)
      : undefined;

    return this.knowledge.search(
      tenant,
      q ?? '',
      scopeType,
      scopeId,
      Number.isFinite(parsed) ? parsed : undefined,
    );
  }

  @Post('projects/:id/memory')
  @TenantRoles('owner', 'admin', 'supervisor')
  addProjectMemory(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: SupabaseUser,
    @Param('id') id: string,
    @Body() body: CreateProjectMemoryDto,
  ) {
    return this.knowledge.addProjectMemory(
      tenant,
      id,
      body,
      user.id,
    );
  }

  @Get('projects/:id/memory')
  listProjectMemory(
    @CurrentTenant() tenant: Tenant,
    @Param('id') id: string,
  ) {
    return this.knowledge.listProjectMemory(
      tenant,
      id,
    );
  }
}
