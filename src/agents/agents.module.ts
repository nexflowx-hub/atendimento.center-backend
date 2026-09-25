import { Module } from '@nestjs/common';
import { AgentGatewayAuthGuard } from './agent-auth.guard';
import { AgentRuntimeService } from './agent-runtime.service';
import { AgentsController } from './agents.controller';
import { MemoryService } from './memory.service';
import { ModelGatewayService } from './model-gateway.service';
import { IntegrationCryptoService } from './integration-crypto.service';
import { IntegrationRegistryService } from './integration-registry.service';
import { IntegrationToolService } from './integration-tool.service';

@Module({
  controllers: [AgentsController],
  providers: [
    AgentGatewayAuthGuard,
    AgentRuntimeService,
    MemoryService,
    ModelGatewayService,
    IntegrationCryptoService,
    IntegrationRegistryService,
    IntegrationToolService,
  ],
})
export class AgentsModule {}
