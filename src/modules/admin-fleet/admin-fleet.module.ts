import { Module } from '@nestjs/common';
import { PlatformModule } from '../../platform/platform.module';
import { AuthModule } from '../auth/auth.module';
import { AdminFleetController } from './admin-fleet.controller';
import { AdminFleetService } from './admin-fleet.service';

@Module({
  imports: [AuthModule, PlatformModule],
  controllers: [AdminFleetController],
  providers: [AdminFleetService],
})
export class AdminFleetModule {}
