import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformModule } from '../../platform/platform.module';
import { AuthModule } from '../auth/auth.module';
import { Branch } from '../catalog/entities/branch.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { AdminFleetController } from './admin-fleet.controller';
import { AdminFleetService } from './admin-fleet.service';
import { Car } from './entities/car.entity';
import { CarTypeBranch } from './entities/car-type-branch.entity';
import { CarType } from './entities/car-type.entity';

@Module({
  imports: [
    AuthModule,
    PlatformModule,
    TypeOrmModule.forFeature([Car, CarType, CarTypeBranch, Branch, Booking]),
  ],
  controllers: [AdminFleetController],
  providers: [AdminFleetService],
})
export class AdminFleetModule {}
