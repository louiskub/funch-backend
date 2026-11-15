import {
  MiddlewareConsumer,
  Module,
  NestModule,
  ValidationPipe,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseFormatInterceptor } from './common/interceptors/response-format.interceptor';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { AdminFleetModule } from './modules/admin-fleet/admin-fleet.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { FilesModule } from './modules/files/files.module';
import { HealthModule } from './platform/health/health.module';
import { OptionsModule } from './modules/options/options.module';
import { PlatformModule } from './platform/platform.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import configFactory from './platform/config/configuration';

@Module({
  imports: [
    PlatformModule,
    ThrottlerModule.forRootAsync({
      useFactory: () => {
        const config = configFactory();
        return [
          {
            name: 'default',
            ttl: config.throttle.ttl,
            limit: config.throttle.limit,
          },
        ];
      },
    }),
    AuthModule,
    CatalogModule,
    OptionsModule,
    AdminFleetModule,
    FilesModule,
    HealthModule,
    BookingsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseFormatInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
