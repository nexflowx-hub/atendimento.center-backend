import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { SupabaseAuthGuard, TenantGuard, TenantRoleGuard } from './auth.guards';
import { SupabaseAuthService } from './supabase-auth.service';

@Module({
  controllers: [AuthController],
  providers: [SupabaseAuthService, SupabaseAuthGuard, TenantGuard, TenantRoleGuard],
  exports: [SupabaseAuthService, SupabaseAuthGuard, TenantGuard, TenantRoleGuard],
})
export class AuthModule {}
