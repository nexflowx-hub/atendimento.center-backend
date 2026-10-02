import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { RuntimeModule } from '../runtime/runtime.module';
import { AgentExecutionWorkerService } from './agent-execution-worker.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),
    DatabaseModule,
    RuntimeModule,
  ],
  providers: [AgentExecutionWorkerService],
})
export class AgentWorkerModule {}
