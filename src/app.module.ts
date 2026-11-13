import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseService } from './database.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionGuard, RolesGuard } from './auth.guards';
import { StateChangeOriginGuard } from './auth-origin.guard';
import { OptionsController } from './options.controller';
import { OptionsService } from './options.service';
import { AdminFleetController } from './admin-fleet.controller';
import { AdminFleetService } from './admin-fleet.service';

@Module({
  imports: [],
  controllers: [
    AppController,
    CatalogController,
    AuthController,
    OptionsController,
    AdminFleetController,
  ],
  providers: [
    AppService,
    DatabaseService,
    CatalogService,
    AuthService,
    PasswordService,
    SessionGuard,
    RolesGuard,
    StateChangeOriginGuard,
    OptionsService,
    AdminFleetService,
  ],
})
export class AppModule {}
