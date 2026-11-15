import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformModule } from '../../platform/platform.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  imports: [AuthModule, PlatformModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
