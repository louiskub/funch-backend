import 'reflect-metadata';
import { DataSource } from 'typeorm';
import configFactory from '../config/configuration';
import { Authentication20260809000200 } from './migrations/20260809000200-Authentication';
import { Files20260809000500 } from './migrations/20260809000500-Files';
import { InitialSchema20260809000100 } from './migrations/20260809000100-InitialSchema';
import { Options20260809000400 } from './migrations/20260809000400-Options';
import { Currency20261115000100 } from './migrations/20261115000100-Currency';
import { Currency } from '../../modules/catalog/entities/currency.entity';
import { AppUser } from '../../modules/auth/entities/app-user.entity';
import { UserSession } from '../../modules/auth/entities/user-session.entity';

export function createAppDataSource() {
  const appConfig = configFactory();
  return new DataSource({
    type: 'postgres',
    url: appConfig.database.postgres.url,
    ssl: appConfig.database.postgres.ssl
      ? { rejectUnauthorized: false }
      : false,
    synchronize: false,
    entities: [AppUser, UserSession, Currency],
    migrations: [
      InitialSchema20260809000100,
      Authentication20260809000200,
      Options20260809000400,
      Files20260809000500,
      Currency20261115000100,
    ],
  });
}

export const AppDataSource = createAppDataSource();
