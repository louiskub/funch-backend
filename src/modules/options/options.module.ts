import { Module } from '@nestjs/common';
import { PlatformModule } from '../../platform/platform.module';
import { AuthModule } from '../auth/auth.module';
import { OptionsController } from './options.controller';
import { OptionsService } from './options.service';

@Module({
  imports: [AuthModule, PlatformModule],
  controllers: [OptionsController],
  providers: [OptionsService],
})
export class OptionsModule {}
