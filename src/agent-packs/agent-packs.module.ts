import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AgentPacksController } from './agent-packs.controller';
import { AgentPacksService } from './agent-packs.service';

@Module({
  imports: [AuthModule],
  controllers: [AgentPacksController],
  providers: [AgentPacksService],
  exports: [AgentPacksService],
})
export class AgentPacksModule {}
