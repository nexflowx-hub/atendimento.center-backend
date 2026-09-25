import { Module } from '@nestjs/common';
import { AgentGatewayAuthGuard } from './agent-auth.guard';
import { AgentRuntimeService } from './agent-runtime.service';
import { AgentsController } from './agents.controller';
import { MemoryService } from './memory.service';
import { ModelGatewayService } from './model-gateway.service';
import { MyTrainXToolService } from './mytrainx-tool.service';

@Module({
  controllers: [AgentsController],
  providers: [
    AgentGatewayAuthGuard,
    AgentRuntimeService,
    MemoryService,
    ModelGatewayService,
    MyTrainXToolService,
  ],
})
export class AgentsModule {}
