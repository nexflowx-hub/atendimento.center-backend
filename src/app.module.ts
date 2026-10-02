import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentsModule } from './agents/agents.module';
import { AuthModule } from './auth/auth.module';
import { ConversationsModule } from './conversations/conversations.module';
import { CrmModule } from './crm/crm.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { IntegrationsModule } from './integrations/integrations.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { RelationshipModule } from './relationship/relationship.module';
import { RuntimeModule } from './runtime/runtime.module';
import { SignalsModule } from './signals/signals.module';
import { SmmModule } from './smm/smm.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { ExecutionModule } from './execution-v2/execution.module';
import { GroupOsModule } from './group-os/group-os.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { AgentPacksModule } from './agent-packs/agent-packs.module';
import { ExecutiveModule } from './executive/executive.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),
    DatabaseModule,
    IntegrationsModule,
    AuthModule,
    ConversationsModule,
    CrmModule,
    AgentsModule,
    RelationshipModule,
    RuntimeModule,
    SmmModule,
    SignalsModule,
    WebhooksModule,
    OnboardingModule,
    ExecutionModule,
    GroupOsModule,
    KnowledgeModule,
    AgentPacksModule,
    ExecutiveModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
