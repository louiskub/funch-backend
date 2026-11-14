import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool, QueryResultRow } from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

const origin = 'http://localhost:3000';
const branchThailand = '20000000-0000-4000-8000-000000000001';
const branchUs = '20000000-0000-4000-8000-000000000002';
const password = 'options-test-password';

describe('Branch options API (isolated PostgreSQL)', () => {
  let app: INestApplication<App>;
  let db: Pool;
  let adminCookie: string;
  let customerCookie: string;

  beforeAll(async () => {
    const databaseUrl = process.env.OPTIONS_TEST_DATABASE_URL;
    if (
      !databaseUrl ||
      new URL(databaseUrl).pathname !== '/funch_ticket06_test'
    ) {
      throw new Error(
        'OPTIONS_TEST_DATABASE_URL must target the isolated funch_ticket06_test database',
      );
    }
    process.env.DATABASE_URL = databaseUrl;
    db = new Pool({ connectionString: databaseUrl });
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableCors({ origin, credentials: true });
    await app.init();
  });

  beforeEach(async () => {
    await db.query('DELETE FROM car_option');
    await db.query('DELETE FROM user_session');
    await db.query('DELETE FROM app_user');
    const admin = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({
        name: 'Test Admin',
        email: 'admin-options@example.com',
        password,
        phone: '+66123456789',
      })
      .expect(201);
    adminCookie = admin.headers['set-cookie'][0].split(';')[0];
    const adminId = (
      await db.query<QueryResultRow & { id: string }>(
        'SELECT id FROM app_user WHERE email = $1',
        ['admin-options@example.com'],
      )
    ).rows[0].id;
    await db.query("UPDATE app_user SET role = 'ADMIN' WHERE id = $1", [
      adminId,
    ]);
    const customer = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({
        name: 'Test Customer',
        email: 'customer-options@example.com',
        password,
        phone: '+66987654321',
      })
      .expect(201);
    customerCookie = customer.headers['set-cookie'][0].split(';')[0];
  });

  afterAll(async () => {
    await app?.close();
    await db?.end();
  });

  const create = (cookie: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/admin/options')
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send(body);

  it('restricts admin routes, filters branch scope, and distinguishes unlimited stock from zero', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/options/branches')
      .set('Cookie', customerCookie)
      .expect(403);
    await create(customerCookie, { branchId: branchThailand }).expect(403);
    await create(adminCookie, {
      branchId: branchThailand,
      code: 'GPS',
      name: 'GPS',
      category: 'EQUIPMENT',
      pricingType: 'PER_UNIT_PER_DAY',
      price: '25.5000',
      quantityStock: 0,
    })
      .set('Cookie', adminCookie)
      .expect(201);
    await create(adminCookie, {
      branchId: branchThailand,
      code: 'DELIVERY',
      name: 'Delivery',
      category: 'SERVICE',
      pricingType: 'FIXED',
      price: '0',
      quantityStock: null,
    }).expect(201);
    const publicOptions = await request(app.getHttpServer())
      .get(`/api/branches/${branchThailand}/options`)
      .expect(200);
    expect(publicOptions.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'GPS',
          quantityStock: 0,
          price: '25.5000',
        }),
        expect.objectContaining({
          code: 'DELIVERY',
          quantityStock: null,
          price: '0.0000',
        }),
      ]),
    );
    await request(app.getHttpServer())
      .get(`/api/branches/${branchUs}/options`)
      .expect(200, []);
    const gpsId = (
      await db.query<QueryResultRow & { id: string }>(
        'SELECT id FROM car_option WHERE code = $1 AND branch_id = $2',
        ['GPS', branchThailand],
      )
    ).rows[0].id;
    await request(app.getHttpServer())
      .patch(`/api/admin/options/${gpsId}`)
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send({ isActive: false })
      .expect(200);
    const remainingOptions = await request(app.getHttpServer())
      .get(`/api/branches/${branchThailand}/options`)
      .expect(200);
    expect(JSON.parse(JSON.stringify(remainingOptions.body))).toMatchObject([
      { code: 'DELIVERY' },
    ]);
    await db.query('UPDATE branch SET is_active = false WHERE id = $1', [
      branchThailand,
    ]);
    try {
      await request(app.getHttpServer())
        .get(`/api/branches/${branchThailand}/options`)
        .expect(200, []);
    } finally {
      await db.query('UPDATE branch SET is_active = true WHERE id = $1', [
        branchThailand,
      ]);
    }
  });

  it('rejects invalid amounts and stock, enforces branch code uniqueness, and keeps pricing type immutable', async () => {
    const valid = {
      branchId: branchThailand,
      code: 'CHILD-SEAT',
      name: 'Child seat',
      category: 'EQUIPMENT',
      pricingType: 'PER_DAY',
      price: '10.125',
      quantityStock: 2,
    };
    await create(adminCookie, { ...valid, price: '-1' }).expect(400);
    await create(adminCookie, { ...valid, price: '10.12345' }).expect(400);
    await create(adminCookie, { ...valid, quantityStock: -1 }).expect(400);
    await create(adminCookie, { ...valid, quantityStock: 1.5 }).expect(400);
    await create(adminCookie, valid).expect(201);
    const createdId = (
      await db.query<QueryResultRow & { id: string }>(
        'SELECT id FROM car_option WHERE code = $1 AND branch_id = $2',
        [valid.code, branchThailand],
      )
    ).rows[0].id;
    await create(adminCookie, valid).expect(409);
    await create(adminCookie, { ...valid, branchId: branchUs }).expect(201);
    await request(app.getHttpServer())
      .patch(`/api/admin/options/${createdId}`)
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send({ pricingType: 'FIXED' })
      .expect(400);
    const stored = await db.query<QueryResultRow & { pricing_type: string }>(
      'SELECT pricing_type FROM car_option WHERE id = $1',
      [createdId],
    );
    expect(stored.rows[0].pricing_type).toBe('PER_DAY');
  });
});
