import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CommonModule } from './common/common.module';
import { ResponseFormatInterceptor } from './common/interceptors/response-format.interceptor';
import { AdminFleetModule } from './modules/admin-fleet/admin-fleet.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { FilesModule } from './modules/files/files.module';
import { HealthModule } from './platform/health/health.module';
import { OptionsModule } from './modules/options/options.module';
import { PlatformModule } from './platform/platform.module';

@Module({
  imports: [
    CommonModule,
    PlatformModule,
    AuthModule,
    CatalogModule,
    OptionsModule,
    AdminFleetModule,
    FilesModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: ResponseFormatInterceptor },
  ],
})
export class AppModule {}
