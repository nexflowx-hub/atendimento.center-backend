import { NestFactory } from '@nestjs/core';
import { AtlasWorkerService } from './execution/atlas-worker.service';
import { WorkerModule } from './execution/worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  const worker = app.get(AtlasWorkerService);

  const shutdown = async () => {
    worker.stop();
    await app.close();
  };

  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());

  await worker.run();
}

void bootstrap();
