import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AgentQueueService } from './agent-queue.service';
import { ExecutionController } from './execution.controller';

@Module({
  imports: [AuthModule],
  controllers: [ExecutionController],
  providers: [AgentQueueService],
  exports: [AgentQueueService],
})
export class ExecutionModule {}
