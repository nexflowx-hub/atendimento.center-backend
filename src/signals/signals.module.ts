import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SignalsController } from './signals.controller';
import { SignalsService } from './signals.service';

@Module({
  imports: [AuthModule],
  controllers: [SignalsController],
  providers: [SignalsService],
})
export class SignalsModule {}
