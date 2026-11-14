import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { PlatformModule } from '../../platform/platform.module';
import { AuthModule } from '../auth/auth.module';
import { AdminFleetController } from './admin-fleet.controller';
import { AdminFleetService } from './admin-fleet.service';

@Module({
  imports: [AuthModule, CommonModule, PlatformModule],
  controllers: [AdminFleetController],
  providers: [AdminFleetService],
})
export class AdminFleetModule {}
