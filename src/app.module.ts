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
import { SignalsModule } from './signals/signals.module';
import { SmmModule } from './smm/smm.module';
import { WebhooksModule } from './webhooks/webhooks.module';

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
    SmmModule,
    SignalsModule,
    WebhooksModule,
    OnboardingModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
