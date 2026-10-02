import { NestFactory } from '@nestjs/core';
import { AgentWorkerModule } from './execution-v2/agent-worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(
    AgentWorkerModule,
    {
      bufferLogs: true,
    },
  );

  app.enableShutdownHooks();
}

void bootstrap();
