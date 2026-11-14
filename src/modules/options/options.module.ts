import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { PlatformModule } from '../../platform/platform.module';
import { AuthModule } from '../auth/auth.module';
import { OptionsController } from './options.controller';
import { OptionsService } from './options.service';

@Module({
  imports: [AuthModule, CommonModule, PlatformModule],
  controllers: [OptionsController],
  providers: [OptionsService],
})
export class OptionsModule {}
