import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AppUser } from '../auth/entities/app-user.entity';
import { UserSession } from '../auth/entities/user-session.entity';
import { PlatformModule } from '../../platform/platform.module';
import { Car } from '../admin-fleet/entities/car.entity';
import { CarTypeBranch } from '../admin-fleet/entities/car-type-branch.entity';
import { Branch } from '../catalog/entities/branch.entity';
import { CarOption } from '../options/entities/car-option.entity';
import { AdditionalCharge } from './entities/additional-charge.entity';
import { BookingOption } from './entities/booking-option.entity';
import { Booking } from './entities/booking.entity';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  imports: [
    AuthModule,
    PlatformModule,
    TypeOrmModule.forFeature([
      Booking,
      BookingOption,
      AdditionalCharge,
      CarTypeBranch,
      CarOption,
      Car,
      Branch,
      AppUser,
      UserSession,
    ]),
  ],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
