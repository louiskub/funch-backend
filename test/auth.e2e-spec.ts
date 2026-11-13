import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash, randomBytes } from 'node:crypto';
import { Pool, QueryResultRow } from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

const frontendOrigin = 'http://localhost:3000';
const password = 'long-enough-test-password';
const account = (email: string) => ({
  name: 'Test Customer',
  email,
  password,
  phone: '+66123456789',
});

function userRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || !('user' in body)) {
    throw new Error('API response has no user');
  }
  const user = body.user;
  if (typeof user !== 'object' || user === null || Array.isArray(user)) {
    throw new Error('API response user is invalid');
  }
  return user;
}

function userId(body: unknown): string {
  const id = userRecord(body).id;
  if (typeof id !== 'string')
    throw new Error('API response user id is invalid');
  return id;
}

describe('Authentication API (isolated PostgreSQL)', () => {
  let app: INestApplication<App>;
  let db: Pool;
  const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;

  beforeAll(async () => {
    if (
      !databaseUrl ||
      new URL(databaseUrl).pathname !== '/funch_ticket03_test'
    ) {
      throw new Error(
        'AUTH_TEST_DATABASE_URL must target the isolated funch_ticket03_test database',
      );
    }
    process.env.DATABASE_URL = databaseUrl;
    db = new Pool({ connectionString: databaseUrl });
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableCors({ origin: frontendOrigin, credentials: true });
    await app.init();
  });

  beforeEach(async () => {
    await db.query('DELETE FROM user_session');
    await db.query('DELETE FROM app_user');
  });

  afterAll(async () => {
    await app?.close();
    await db?.end();
  });

  it('registers a customer, stores only a hash, rejects duplicate email and mass assignment, and sets a safe cookie', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        ...account('Customer@Example.com'),
        role: 'ADMIN',
        isSuspended: true,
      })
      .set('Origin', frontendOrigin)
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        ...account('long-password@example.com'),
        password: 'x'.repeat(129),
      })
      .set('Origin', frontendOrigin)
      .expect(400);

    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(account('Customer@Example.com'))
      .set('Origin', frontendOrigin)
      .expect(201);
    const user = userRecord(response.body);
    expect(user).toMatchObject({
      email: 'customer@example.com',
      role: 'CUSTOMER',
      isSuspended: false,
    });
    expect(user.passwordHash).toBeUndefined();
    expect(response.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
    expect(response.headers['set-cookie'][0]).toMatch(/SameSite=Lax/i);
    expect(response.headers['set-cookie'][0]).not.toMatch(/Secure/i);

    const stored = await db.query<
      {
        password_hash: string;
        role: string;
        is_suspended: boolean;
      } & QueryResultRow
    >(
      'SELECT password_hash, role, is_suspended FROM app_user WHERE email = $1',
      ['customer@example.com'],
    );
    expect(stored.rows[0].password_hash).not.toBe(password);
    expect(stored.rows[0].password_hash).toMatch(/^scrypt\$/);
    expect(stored.rows[0]).toMatchObject({
      role: 'CUSTOMER',
      is_suspended: false,
    });

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(account('CUSTOMER@example.com'))
      .set('Origin', frontendOrigin)
      .expect(409);

    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const secureLogin = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'customer@example.com', password })
        .set('Origin', frontendOrigin)
        .expect(201);
      expect(secureLogin.headers['set-cookie'][0]).toMatch(/Secure/i);
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('logs in, reads and updates only the session owner profile, then revokes that session on logout', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(account('one@example.com'))
      .set('Origin', frontendOrigin)
      .expect(201);
    const firstCookie = first.headers['set-cookie'][0].split(';')[0];
    const second = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(account('two@example.com'))
      .set('Origin', frontendOrigin)
      .expect(201);
    const secondCookie = second.headers['set-cookie'][0].split(';')[0];

    await request(app.getHttpServer())
      .options('/api/auth/login')
      .set('Origin', frontendOrigin)
      .set('Access-Control-Request-Method', 'POST')
      .expect(204)
      .expect('Access-Control-Allow-Origin', frontendOrigin)
      .expect('Access-Control-Allow-Credentials', 'true');

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'ONE@example.com', password })
      .set('Origin', frontendOrigin)
      .expect(201);
    expect(userId(login.body)).toBe(userId(first.body));
    const firstProfile = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', firstCookie)
      .expect(200);
    expect(userId(firstProfile.body)).toBe(userId(first.body));
    const secondProfile = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', secondCookie)
      .expect(200);
    expect(userId(secondProfile.body)).toBe(userId(second.body));
    await request(app.getHttpServer())
      .patch('/api/auth/me')
      .set('Cookie', firstCookie)
      .set('Origin', frontendOrigin)
      .send({
        name: 'Changed',
        email: 'changed@example.com',
        phone: '+66987654321',
        id: userId(second.body),
      })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/api/auth/me')
      .set('Cookie', firstCookie)
      .set('Origin', frontendOrigin)
      .send({
        name: 'Changed',
        email: 'changed@example.com',
        phone: '+66987654321',
        role: 'ADMIN',
        isSuspended: true,
      })
      .expect(400);
    const updated = await request(app.getHttpServer())
      .patch('/api/auth/me')
      .set('Cookie', firstCookie)
      .set('Origin', frontendOrigin)
      .send({
        name: 'Changed',
        email: 'changed@example.com',
        phone: '+66987654321',
      })
      .expect(200);
    expect(userRecord(updated.body)).toMatchObject({
      id: userId(first.body),
      name: 'Changed',
      email: 'changed@example.com',
      phone: '+66987654321',
      role: 'CUSTOMER',
    });

    const logout = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', firstCookie)
      .set('Origin', frontendOrigin)
      .expect(201);
    expect(logout.headers['set-cookie'][0]).toMatch(/Expires=/i);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', firstCookie)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'one@example.com', password: 'wrong' })
      .set('Origin', frontendOrigin)
      .expect(401);
  });

  it('rejects missing and untrusted origins, expired sessions, and a suspension applied after login', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(account('no-origin@example.com'))
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'none@example.com', password })
      .set('Origin', 'https://evil.example')
      .expect(403);

    const registered = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(account('suspend@example.com'))
      .set('Origin', frontendOrigin)
      .expect(201);
    const cookie = registered.headers['set-cookie'][0].split(';')[0];
    const token = cookie.slice('funch_session='.length);
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', 'funch_session=%ZZ')
      .expect(401);
    const expiredToken = randomBytes(32).toString('base64url');
    await db.query(
      "INSERT INTO user_session (token_hash, user_id, expires_at) VALUES ($1, $2, now() - interval '1 minute')",
      [
        createHash('sha256').update(expiredToken).digest('hex'),
        userId(registered.body),
      ],
    );
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', `funch_session=${expiredToken}`)
      .expect(401);

    await db.query('UPDATE app_user SET is_suspended = true WHERE id = $1', [
      userId(registered.body),
    ]);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(403);
    const session = await db.query<
      { token_hash: string; revoked_at: Date | null } & QueryResultRow
    >('SELECT token_hash, revoked_at FROM user_session WHERE token_hash = $1', [
      tokenHash,
    ]);
    expect(session.rowCount).toBe(1);
    const expiredSession = await db.query<
      { revoked_at: Date | null } & QueryResultRow
    >('SELECT revoked_at FROM user_session WHERE token_hash = $1', [
      createHash('sha256').update(expiredToken).digest('hex'),
    ]);
    expect(expiredSession.rows[0].revoked_at).not.toBeNull();
  });

  it('rolls back a new account when session creation fails', async () => {
    await db.query(`CREATE FUNCTION fail_auth_session_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'forced session insert failure'; END $$`);
    await db.query(
      'CREATE TRIGGER fail_auth_session_insert BEFORE INSERT ON user_session FOR EACH ROW EXECUTE FUNCTION fail_auth_session_insert()',
    );
    try {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(account('atomic@example.com'))
        .set('Origin', frontendOrigin)
        .expect(500);
      const accountCount = await db.query<{ count: number } & QueryResultRow>(
        'SELECT count(*)::int AS count FROM app_user WHERE email = $1',
        ['atomic@example.com'],
      );
      expect(accountCount.rows[0].count).toBe(0);
    } finally {
      await db.query(
        'DROP TRIGGER IF EXISTS fail_auth_session_insert ON user_session',
      );
      await db.query('DROP FUNCTION IF EXISTS fail_auth_session_insert()');
    }
  });
});
