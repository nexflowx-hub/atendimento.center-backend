import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { SupabaseAuthGuard, TenantGuard } from './auth.guards';
import { SupabaseAuthService } from './supabase-auth.service';

@Module({
  controllers: [AuthController],
  providers: [SupabaseAuthService, SupabaseAuthGuard, TenantGuard],
  exports: [SupabaseAuthService, SupabaseAuthGuard, TenantGuard],
})
export class AuthModule {}
