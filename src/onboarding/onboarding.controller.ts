import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/auth.decorators';
import { SupabaseAuthGuard } from '../auth/auth.guards';
import type { SupabaseUser } from '../auth/auth.types';
import { CreateWorkspaceDto } from './onboarding.dto';
import { OnboardingService } from './onboarding.service';

@Controller('onboarding')
@UseGuards(SupabaseAuthGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post('workspace')
  createWorkspace(
    @CurrentUser() user: SupabaseUser,
    @Body() body: CreateWorkspaceDto,
  ) {
    return this.onboarding.createWorkspace(user, body);
  }
}
