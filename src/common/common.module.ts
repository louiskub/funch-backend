import { Module } from '@nestjs/common';
import { StateChangeOriginGuard } from './guards/state-change-origin.guard';
import { ResponseFormatInterceptor } from './interceptors/response-format.interceptor';

@Module({
  providers: [StateChangeOriginGuard, ResponseFormatInterceptor],
  exports: [StateChangeOriginGuard, ResponseFormatInterceptor],
})
export class CommonModule {}
