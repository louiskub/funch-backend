/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import configFactory from '../../platform/config/configuration';

@Injectable()
export class StateChangeOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    const expected = configFactory().app.frontendOrigin;
    const source = request.get('origin') ?? request.get('referer');
    let sourceOrigin: string | undefined;
    try {
      sourceOrigin = source ? new URL(source).origin : undefined;
    } catch {
      sourceOrigin = undefined;
    }
    if (sourceOrigin !== expected)
      throw new ForbiddenException('Untrusted request origin');
    return true;
  }
}
