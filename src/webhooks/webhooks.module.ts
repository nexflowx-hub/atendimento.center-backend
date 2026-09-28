import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [IntegrationsModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
