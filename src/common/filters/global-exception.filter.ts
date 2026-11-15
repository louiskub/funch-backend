import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { REQUEST_ID_HEADER } from '../middleware/correlation-id.middleware';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const code =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    let messages = STATUS_CODES[code] ?? 'Request failed';

    const rawReqId =
      request?.headers?.[REQUEST_ID_HEADER] ??
      (response?.getHeader?.(REQUEST_ID_HEADER) as
        string | string[] | undefined);
    const reqId =
      typeof rawReqId === 'string'
        ? rawReqId
        : Array.isArray(rawReqId)
          ? rawReqId[0]
          : undefined;

    if (reqId && !response.headersSent) {
      response.setHeader(REQUEST_ID_HEADER, reqId);
    }

    if (code >= 500) {
      messages = 'Internal server error';
      const prefix = reqId ? `[${reqId}] ` : '';
      this.logger.error(
        `${prefix}${
          exception instanceof Error
            ? (exception.stack ?? exception.message)
            : 'Unhandled server error'
        }`,
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
