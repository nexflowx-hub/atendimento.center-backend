import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { PublicSmmController } from './smm-public.controller';
import { SmmController } from './smm.controller';
import { SmmService } from './smm.service';

@Module({
  imports: [AuthModule, IntegrationsModule],
  controllers: [SmmController, PublicSmmController],
  providers: [SmmService],
})
export class SmmModule {}
