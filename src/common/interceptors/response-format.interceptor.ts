import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
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
    const response = context.switchToHttp().getResponse();
    const statusCode = response.statusCode;
    const message = response.statusMessage ?? '';

    return next.handle().pipe(
      map((data: T) => ({
        status: { code: statusCode, messages: message },
        data,
      })),
    );
  }
}
