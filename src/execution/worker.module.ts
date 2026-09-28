import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { AtlasWorkerService } from './atlas-worker.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    DatabaseModule,
  ],
  providers: [AtlasWorkerService],
  exports: [AtlasWorkerService],
})
export class WorkerModule {}
