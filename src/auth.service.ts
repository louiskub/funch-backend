import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseService } from './database.service';
import type { AuthUser } from './auth.types';
import type { QueryResultRow } from 'pg';
import { PasswordService } from './password.service';
import { LoginDto, RegisterDto, UpdateProfileDto } from './auth.dto';

const SESSION_DAYS = 14;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    Reflect.get(error, 'code') === '23505'
  );
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly passwords: PasswordService,
  ) {}

  async register(input: RegisterDto) {
    const email = input.email.trim().toLowerCase();
    const passwordHash = await this.passwords.hash(input.password);
    try {
      return await this.db.transaction(async (client) => {
        const { rows } = await client.query<AuthUser & QueryResultRow>(
          `INSERT INTO app_user (id, email, password_hash, name, phone, role, is_suspended)
           VALUES ($1, $2, $3, $4, $5, 'CUSTOMER', false)
           RETURNING id, email, name, phone, role, is_suspended AS "isSuspended"`,
          [
            randomUUID(),
            email,
            passwordHash,
            input.name.trim(),
            input.phone.trim(),
          ],
        );
        const session = this.newSession(rows[0]);
        await client.query(
          'INSERT INTO user_session (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
          [session.tokenHash, session.user.id, session.expiresAt],
        );
        return {
          user: session.user,
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
    const { rows } = await this.db.query<
      AuthUser & QueryResultRow & { passwordHash: string }
    >(
      `SELECT id, email, name, phone, role, is_suspended AS "isSuspended", password_hash AS "passwordHash"
       FROM app_user WHERE email = $1`,
      [input.email.trim().toLowerCase()],
    );
    const user = rows[0];
    if (
      !user ||
      user.isSuspended ||
      !(await this.passwords.verify(input.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const authenticatedUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      isSuspended: user.isSuspended,
    };
    return this.createSession(authenticatedUser);
  }

  async logout(token: string | undefined): Promise<void> {
    if (token)
      await this.db.query(
        'UPDATE user_session SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
        [this.tokenHash(token)],
      );
  }

  async updateProfile(
    userId: string,
    input: UpdateProfileDto,
  ): Promise<AuthUser> {
    try {
      const { rows } = await this.db.query<AuthUser & QueryResultRow>(
        `UPDATE app_user SET name = $2, email = $3, phone = $4, updated_at = now()
         WHERE id = $1 RETURNING id, email, name, phone, role, is_suspended AS "isSuspended"`,
        [
          userId,
          input.name.trim(),
          input.email.trim().toLowerCase(),
          input.phone.trim(),
        ],
      );
      return rows[0];
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
    await this.db.query(
      'INSERT INTO user_session (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
      [session.tokenHash, user.id, session.expiresAt],
    );
    return { user, token: session.token, expiresAt: session.expiresAt };
  }

  private newSession(user: AuthUser) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    return { user, token, tokenHash: this.tokenHash(token), expiresAt };
  }

  private tokenHash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
