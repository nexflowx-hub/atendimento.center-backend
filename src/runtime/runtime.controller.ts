import {
  Body,
  Controller,
  Get,
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
import { StartRuntimeRunDto } from './runtime.dto';
import { RuntimeRunService } from './runtime-run.service';

@Controller('runtime')
@UseGuards(
  SupabaseAuthGuard,
  TenantGuard,
  TenantRoleGuard,
)
export class RuntimeController {
  constructor(private readonly runtime: RuntimeRunService) {}

  @Get('runs/:id')
  get(
    @CurrentTenant() tenant: Tenant,
    @Param('id') id: string,
  ) {
    return this.runtime.get(tenant, id);
  }

  @Post('runs')
  @TenantRoles('owner', 'admin', 'supervisor', 'agent')
  start(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: SupabaseUser,
    @Body() body: StartRuntimeRunDto,
  ) {
    return this.runtime.start(
      tenant,
      { type: 'user', id: user.id },
      body,
    );
  }
}
