import {
  Body,
  Controller,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Tenant } from '@prisma/client';
import {
  CurrentTenant,
  CurrentUser,
  TenantRoles,
} from '../../auth/auth.decorators';
import {
  SupabaseAuthGuard,
  TenantGuard,
  TenantRoleGuard,
} from '../../auth/auth.guards';
import type { SupabaseUser } from '../../auth/auth.types';
import { ApprovalEngineService } from './approval-engine.service';
import { DecideApprovalDto } from './approval.dto';

@Controller('runtime/approvals')
@UseGuards(
  SupabaseAuthGuard,
  TenantGuard,
  TenantRoleGuard,
)
export class ApprovalController {
  constructor(
    private readonly approvals: ApprovalEngineService,
  ) {}

  @Post(':id/decision')
  @TenantRoles('owner', 'admin')
  decide(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: SupabaseUser,
    @Param('id') id: string,
    @Body() body: DecideApprovalDto,
  ) {
    return this.approvals.decide(
      tenant,
      id,
      body,
      {
        type: 'user',
        id: user.id,
      },
    );
  }
}
