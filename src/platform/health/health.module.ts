import { Module } from '@nestjs/common';
import { PlatformModule } from '../platform.module';
import { HealthController } from './health.controller';

@Module({ imports: [PlatformModule], controllers: [HealthController] })
export class HealthModule {}
