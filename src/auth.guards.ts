import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import { DatabaseService } from './database.service';
import type { AuthenticatedRequest, AuthUser } from './auth.types';
import { UserRole } from './auth.types';
import type { QueryResultRow } from 'pg';
import { ROLES_KEY } from './auth.decorators';

export const SESSION_COOKIE = 'funch_session';

function sessionToken(request: AuthenticatedRequest): string | undefined {
  const raw = request.headers.cookie;
  if (!raw) return undefined;
  const entry = raw
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  const token = entry?.slice(SESSION_COOKIE.length + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = sessionToken(request);
    if (!token) throw new UnauthorizedException();
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const { rows } = await this.db.query<
      AuthUser & QueryResultRow & { isSessionValid: boolean }
    >(
      `SELECT u.id, u.email, u.name, u.phone, u.role, u.is_suspended AS "isSuspended",
              s.expires_at > now() AS "isSessionValid"
       FROM user_session s JOIN app_user u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL`,
      [tokenHash],
    );
    const user = rows[0];
    if (!user) throw new UnauthorizedException();
    if (!user.isSessionValid) {
      await this.db.query(
        'UPDATE user_session SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
        [tokenHash],
      );
      throw new UnauthorizedException();
    }
    if (user.isSuspended) throw new ForbiddenException('Account suspended');
    const authenticatedUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      isSuspended: user.isSuspended,
    };
    request.authUser = authenticatedUser;
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.authUser || !roles.includes(request.authUser.role))
      throw new ForbiddenException();
    return true;
  }
}
