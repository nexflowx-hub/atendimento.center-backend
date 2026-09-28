import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ChatwootService } from './chatwoot.service';
import { EvolutionService } from './evolution.service';
import { OpenRouterService } from './openrouter.service';
import { XPaymentsService } from './xpayments.service';

@Module({
  imports: [HttpModule.register({ timeout: 15000, maxRedirects: 3 })],
  providers: [ChatwootService, EvolutionService, OpenRouterService, XPaymentsService],
  exports: [ChatwootService, EvolutionService, OpenRouterService, XPaymentsService],
})
export class IntegrationsModule {}
