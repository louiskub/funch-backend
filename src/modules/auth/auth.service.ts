import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DataSource, IsNull, Repository } from 'typeorm';
import type { AuthUser } from './types/auth.types';
import { LoginDto, RegisterDto, UpdateProfileDto } from './dto/auth.dto';
import { AppUser } from './entities/app-user.entity';
import { UserSession } from './entities/user-session.entity';
import { UserRole } from './enums/user-role.enum';
import { PasswordService } from './services/password.service';

const SESSION_DAYS = 14;

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const driverError = Reflect.get(error, 'driverError');
  return Reflect.get(driverError ?? error, 'code') === '23505';
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AppUser)
    private readonly userRepo: Repository<AppUser>,
    @InjectRepository(UserSession)
    private readonly sessionRepo: Repository<UserSession>,
    private readonly dataSource: DataSource,
    private readonly passwords: PasswordService,
  ) {}

  async register(input: RegisterDto) {
    const email = input.email.trim().toLowerCase();
    const passwordHash = await this.passwords.hash(input.password);
    try {
      return await this.dataSource.transaction(async (manager) => {
        const user = await manager.getRepository(AppUser).save({
          id: randomUUID(),
          email,
          passwordHash,
          name: input.name.trim(),
          phone: input.phone.trim(),
          role: UserRole.CUSTOMER,
          isSuspended: false,
        });
        const session = this.newSession(user);
        await manager.getRepository(UserSession).save({
          tokenHash: session.tokenHash,
          userId: user.id,
          expiresAt: session.expiresAt,
          revokedAt: null,
        });
        return {
          user: this.publicUser(user),
          token: session.token,
          expiresAt: session.expiresAt,
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw error;
    }
  }

  async login(input: LoginDto) {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', {
        email: input.email.trim().toLowerCase(),
      })
      .getOne();
    if (
      !user ||
      user.isSuspended ||
      !(await this.passwords.verify(input.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.createSession(this.publicUser(user));
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.sessionRepo.update(
      { tokenHash: this.tokenHash(token), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async updateProfile(
    userId: string,
    input: UpdateProfileDto,
  ): Promise<AuthUser> {
    try {
      await this.userRepo.update(userId, {
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        phone: input.phone.trim(),
      });
      const user = await this.userRepo.findOneBy({ id: userId });
      if (!user) throw new UnauthorizedException();
      return this.publicUser(user);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw error;
    }
  }

  private async createSession(user: AuthUser) {
    const session = this.newSession(user);
    await this.sessionRepo.save({
      tokenHash: session.tokenHash,
      userId: user.id,
      expiresAt: session.expiresAt,
      revokedAt: null,
    });
    return { user, token: session.token, expiresAt: session.expiresAt };
  }

  private publicUser(user: AppUser): AuthUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      isSuspended: user.isSuspended,
    };
  }

  private newSession(user: Pick<AuthUser, 'id'>) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    return { user, token, tokenHash: this.tokenHash(token), expiresAt };
  }

  private tokenHash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
