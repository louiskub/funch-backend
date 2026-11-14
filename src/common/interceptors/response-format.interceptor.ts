import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { Observable, map } from 'rxjs';

export interface CustomResponse<T> {
  status: { code: number; messages: string };
  data: T;
}

@Injectable()
export class ResponseFormatInterceptor<T> implements NestInterceptor<
  T,
  CustomResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<CustomResponse<T>> {
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((data: T) => ({
        status: {
          code: response.statusCode,
          messages:
            response.statusMessage || STATUS_CODES[response.statusCode] || '',
        },
        data,
      })),
    );
  }
}
