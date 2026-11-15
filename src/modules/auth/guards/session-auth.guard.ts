import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';
import { SESSION_COOKIE } from '../constants/session.constants';
import type { AuthenticatedRequest, AuthUser } from '../types/auth.types';
import { UserSession } from '../entities/user-session.entity';

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
export class SessionAuthGuard implements CanActivate {
  constructor(
    @InjectRepository(UserSession)
    private readonly sessionRepo: Repository<UserSession>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = sessionToken(request);
    if (!token) throw new UnauthorizedException();
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const session = await this.sessionRepo.findOne({
      where: { tokenHash },
      relations: { user: true },
    });
    if (!session || session.revokedAt) throw new UnauthorizedException();
    if (session.expiresAt <= new Date()) {
      session.revokedAt = new Date();
      await this.sessionRepo.save(session);
      throw new UnauthorizedException();
    }
    if (session.user.isSuspended)
      throw new ForbiddenException('Account suspended');

    const user: AuthUser = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      phone: session.user.phone,
      role: session.user.role,
      isSuspended: session.user.isSuspended,
    };
    request.authUser = user;
    return true;
  }
}
