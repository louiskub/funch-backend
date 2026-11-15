import 'reflect-metadata';
import * as path from 'path';
import { DataSource } from 'typeorm';
import configFactory from '../config/configuration';
import { Currency } from '../../modules/catalog/entities/currency.entity';
import { AppUser } from '../../modules/auth/entities/app-user.entity';
import { UserSession } from '../../modules/auth/entities/user-session.entity';
import { Booking } from '../../modules/bookings/entities/booking.entity';
import { BookingOption } from '../../modules/bookings/entities/booking-option.entity';
import { AdditionalCharge } from '../../modules/bookings/entities/additional-charge.entity';
import { Branch } from '../../modules/catalog/entities/branch.entity';
import { Country } from '../../modules/catalog/entities/country.entity';
import { CarType } from '../../modules/admin-fleet/entities/car-type.entity';
import { CarTypeBranch } from '../../modules/admin-fleet/entities/car-type-branch.entity';
import { Car } from '../../modules/admin-fleet/entities/car.entity';
import { CarOption } from '../../modules/options/entities/car-option.entity';
import { FileAsset } from '../../modules/files/entities/file-asset.entity';

export function createAppDataSource() {
  const appConfig = configFactory();
  return new DataSource({
    type: 'postgres',
    url: appConfig.database.postgres.url,
    ssl: appConfig.database.postgres.ssl
      ? { rejectUnauthorized: false }
      : false,
    synchronize: false,
    entities: [
      AppUser,
      UserSession,
      Currency,
      Country,
      Branch,
      CarType,
      CarTypeBranch,
      Car,
      CarOption,
      FileAsset,
      Booking,
      BookingOption,
      AdditionalCharge,
    ],
    migrations: [path.join(__dirname, 'migrations/*{.ts,.js}')],
  });
}

export const AppDataSource = createAppDataSource();
