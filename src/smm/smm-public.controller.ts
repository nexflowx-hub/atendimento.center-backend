import { Controller, Get, Param, Query } from '@nestjs/common';
import { PublicSmmOffersQuery } from './smm.dto';
import { SmmService } from './smm.service';

@Controller('public/smm')
export class PublicSmmController {
  constructor(private readonly smm: SmmService) {}

  @Get(':tenantSlug/offers')
  listOffers(
    @Param('tenantSlug') tenantSlug: string,
    @Query() query: PublicSmmOffersQuery,
  ) {
    return this.smm.listPublicOffers(tenantSlug, query);
  }
}
