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
import { CurrentTenant } from '../auth/auth.decorators';
import { SupabaseAuthGuard, TenantGuard } from '../auth/auth.guards';
import { CanonicalInboundDto, RelationshipRespondDto } from './relationship.dto';
import { RelationshipService } from './relationship.service';

@Controller('relationship')
@UseGuards(SupabaseAuthGuard, TenantGuard)
export class RelationshipController {
  constructor(private readonly relationships: RelationshipService) {}

  @Get(':agentCode/contacts/:contactId/context')
  context(
    @CurrentTenant() tenant: Tenant,
    @Param('agentCode') agentCode: string,
    @Param('contactId') contactId: string,
    @Query('conversationRefId') conversationRefId?: string,
  ) {
    return this.relationships.getContext(
      tenant,
      agentCode,
      contactId,
      conversationRefId,
    );
  }

  @Post('inbound')
  inbound(
    @CurrentTenant() tenant: Tenant,
    @Body() body: CanonicalInboundDto,
  ) {
    return this.relationships.inbound(tenant, body);
  }

  @Post('respond')
  respond(
    @CurrentTenant() tenant: Tenant,
    @Body() body: RelationshipRespondDto,
  ) {
    return this.relationships.respond(tenant, body);
  }
}
