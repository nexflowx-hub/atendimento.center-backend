import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SmmController } from './smm.controller';
import { SmmService } from './smm.service';

@Module({
  imports: [AuthModule],
  controllers: [SmmController],
  providers: [SmmService],
})
export class SmmModule {}
