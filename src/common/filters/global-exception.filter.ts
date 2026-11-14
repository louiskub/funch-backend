import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { STATUS_CODES } from 'node:http';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const code =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    let messages = STATUS_CODES[code] ?? 'Request failed';

    if (code >= 500) {
      messages = 'Internal server error';
      this.logger.error(
        exception instanceof Error
          ? (exception.stack ?? exception.message)
          : 'Unhandled server error',
      );
    } else if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        messages = body;
      } else if ('message' in body) {
        const message: unknown = body.message;
        if (typeof message === 'string') {
          messages = message;
        } else if (
          Array.isArray(message) &&
          message.every((item: unknown) => typeof item === 'string')
        ) {
          messages = message.join('; ');
        }
      }
    }

    response.status(code).json({ status: { code, messages }, data: null });
  }
}
