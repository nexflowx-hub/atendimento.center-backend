import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ConversationsController } from './conversations.controller';

@Module({
  imports: [AuthModule, IntegrationsModule],
  controllers: [ConversationsController],
})
export class ConversationsModule {}
