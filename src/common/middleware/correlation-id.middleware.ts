import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming =
      req.headers[REQUEST_ID_HEADER] ?? req.headers['x-correlation-id'];
    const id =
      typeof incoming === 'string' && incoming.trim()
        ? incoming.trim()
        : randomUUID();

    req.headers[REQUEST_ID_HEADER] = id;
    res.setHeader(REQUEST_ID_HEADER, id);

    next();
  }
}
