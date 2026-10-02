import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GroupOsController } from './group-os.controller';
import { GroupOsService } from './group-os.service';

@Module({
  imports: [AuthModule],
  controllers: [GroupOsController],
  providers: [GroupOsService],
  exports: [GroupOsService],
})
export class GroupOsModule {}
