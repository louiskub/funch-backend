import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

const origin = 'http://localhost:3000';
const branchId = '20000000-0000-4000-8000-000000000001';
const password = 'long-enough-test-password';

function object(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text) as unknown;
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected an object response');
  return Object.fromEntries(Object.entries(value));
}

function id(value: Record<string, unknown>): string {
  if (typeof value.id !== 'string') throw new Error('Expected response ID');
  return value.id;
}

describe('Admin fleet API (PostgreSQL)', () => {
  let app: INestApplication<App>;
  let db: Pool;
  let adminCookie: string;
  let customerCookie: string;
  let serial = 0;

  beforeAll(async () => {
    const url = process.env.ADMIN_TEST_DATABASE_URL;
    if (!url || new URL(url).pathname !== '/funch_ticket04_test') {
      throw new Error(
        'ADMIN_TEST_DATABASE_URL must target funch_ticket04_test',
      );
    }
    process.env.DATABASE_URL = url;
    db = new Pool({ connectionString: url });
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableCors({ origin, credentials: true });
    await app.init();
  });

  beforeEach(async () => {
    serial += 1;
    const email = `fleet-${serial}-${randomUUID()}@example.com`;
    const admin = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({ name: 'Fleet Admin', email, password, phone: '+66123456789' })
      .expect(201);
    adminCookie = admin.headers['set-cookie'][0].split(';')[0];
    await db.query("UPDATE app_user SET role = 'ADMIN' WHERE email = $1", [
      email,
    ]);
    const customer = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({
        name: 'Fleet Customer',
        email: `customer-${email}`,
        password,
        phone: '+66123456789',
      })
      .expect(201);
    customerCookie = customer.headers['set-cookie'][0].split(';')[0];
  });

  afterEach(async () => {
    await db.query(`DELETE FROM car WHERE car_type_branch_id IN (
      SELECT o.id FROM car_type_branch o JOIN car_type t ON t.id = o.car_type_id
      WHERE t.brand LIKE 'Fleet%' OR t.brand LIKE 'Unique%')`);
    await db.query(`DELETE FROM car_type_branch WHERE car_type_id IN (
      SELECT id FROM car_type WHERE brand LIKE 'Fleet%' OR brand LIKE 'Unique%')`);
    await db.query(
      "DELETE FROM car_type WHERE brand LIKE 'Fleet%' OR brand LIKE 'Unique%'",
    );
  });

  afterAll(async () => {
    await app?.close();
    await db?.end();
  });

  it('allows only admins to read and mutate fleet data', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/fleet/car-types')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/admin/fleet/car-types')
      .set('Cookie', customerCookie)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/admin/fleet/car-types')
      .set('Cookie', adminCookie)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/admin/fleet/car-types')
      .set('Cookie', customerCookie)
      .set('Origin', origin)
      .send({
        brand: 'Denied',
        model: 'Denied',
        seats: 4,
        transmission: 'AUTO',
        fuelType: 'GASOLINE',
        features: [],
      })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/admin/fleet/car-types')
      .set('Cookie', adminCookie)
      .send({
        brand: 'Denied',
        model: 'No origin',
        seats: 4,
        transmission: 'AUTO',
        fuelType: 'GASOLINE',
        features: [],
      })
      .expect(403);
  });

  it('creates and updates car types, offers, and cars and exposes active changes to public catalog', async () => {
    const suffix = randomUUID().slice(0, 8);
    const type = await request(app.getHttpServer())
      .post('/api/admin/fleet/car-types')
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send({
        brand: `Fleet${suffix}`,
        model: 'Test',
        seats: 5,
        transmission: 'AUTO',
        fuelType: 'HYBRID',
        features: ['AC'],
      })
      .expect(201);
    const typeBody = object(type.text);
    const typeId = id(typeBody);
    expect(typeBody).toMatchObject({
      brand: `Fleet${suffix}`,
      model: 'Test',
      isActive: true,
    });

    const offer = await request(app.getHttpServer())
      .post('/api/admin/fleet/offers')
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send({
        carTypeId: typeId,
        branchId,
        baseDailyRate: '1234.5678',
        baseHourlyRate: '120',
        currencyCode: 'THB',
      })
      .expect(201);
    const offerBody = object(offer.text);
    const offerId = id(offerBody);
    expect(offerBody).toMatchObject({
      baseDailyRate: '1234.5678',
      baseHourlyRate: '120.0000',
      currencyCode: 'THB',
    });
    await request(app.getHttpServer())
      .post('/api/admin/fleet/offers')
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send({
        carTypeId: typeId,
        branchId,
        baseDailyRate: '1',
        baseHourlyRate: '1',
        currencyCode: 'THB',
      })
      .expect(409);
    const publicOffers = await request(app.getHttpServer())
      .get(`/api/branches/${branchId}/offers`)
      .expect(200);
    expect(JSON.parse(publicOffers.text) as unknown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          carTypeId: typeId,
          baseDailyRate: '1234.5678',
        }),
      ]),
    );

    const car = await request(app.getHttpServer())
      .post('/api/admin/fleet/cars')
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send({
        carTypeBranchId: offerId,
        vin: `VIN-${suffix}`,
        licensePlate: `PLATE-${suffix}`,
        year: 2025,
        buyDate: null,
        status: 'ACTIVE',
      })
      .expect(201);
    const carBody = object(car.text);
    const carId = id(carBody);
    expect(carBody).toMatchObject({
      carTypeBranchId: offerId,
      buyDate: null,
      status: 'ACTIVE',
    });
    await request(app.getHttpServer())
      .post('/api/admin/fleet/cars')
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send({
        carTypeBranchId: offerId,
        vin: `VIN-${suffix}`,
        licensePlate: `OTHER-${suffix}`,
        year: 2025,
        status: 'ACTIVE',
      })
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/admin/fleet/cars')
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send({
        carTypeBranchId: offerId,
        vin: `OTHER-${suffix}`,
        licensePlate: `PLATE-${suffix}`,
        year: 2025,
        status: 'ACTIVE',
      })
      .expect(409);

    await request(app.getHttpServer())
      .patch(`/api/admin/fleet/cars/${carId}`)
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send({ status: 'DECOMMISSIONED' })
      .expect(200)
      .expect(({ text }) => expect(object(text).status).toBe('DECOMMISSIONED'));
    await request(app.getHttpServer())
      .patch(`/api/admin/fleet/offers/${offerId}`)
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send({ baseHourlyRate: '99.125', isActive: false })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/admin/fleet/car-types/${typeId}`)
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send({ isActive: false })
      .expect(200);
    const inactivePublicOffers = await request(app.getHttpServer())
      .get(`/api/branches/${branchId}/offers`)
      .expect(200);
    expect(JSON.parse(inactivePublicOffers.text) as unknown).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ carTypeId: typeId })]),
    );
    const allOffers = await request(app.getHttpServer())
      .get('/api/admin/fleet/offers')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(JSON.parse(allOffers.text) as unknown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: offerId, isActive: false }),
      ]),
    );
    const allTypes = await request(app.getHttpServer())
      .get('/api/admin/fleet/car-types')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(JSON.parse(allTypes.text) as unknown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: typeId, isActive: false }),
      ]),
    );
  });

  it('rejects duplicate identities, missing foreign keys, invalid ranges, and malformed IDs', async () => {
    const suffix = randomUUID().slice(0, 8);
    const input = {
      brand: `Unique${suffix}`,
      model: 'Model',
      seats: 5,
      transmission: 'AUTO',
      fuelType: 'GASOLINE',
      features: [],
    };
    const type = await request(app.getHttpServer())
      .post('/api/admin/fleet/car-types')
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send(input)
      .expect(201);
    const typeId = id(object(type.text));
    await request(app.getHttpServer())
      .post('/api/admin/fleet/car-types')
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send(input)
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/admin/fleet/offers')
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send({
        carTypeId: typeId,
        branchId: randomUUID(),
        baseDailyRate: '1',
        baseHourlyRate: '1',
        currencyCode: 'THB',
      })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/admin/fleet/car-types/${typeId}`)
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send({ features: null })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/admin/fleet/offers')
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send({
        carTypeId: typeId,
        branchId,
        baseDailyRate: '1.12345',
        baseHourlyRate: '1',
        currencyCode: 'THB',
      })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/api/admin/fleet/car-types/not-a-uuid')
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send({ isActive: false })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/admin/fleet/cars')
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send({
        carTypeBranchId: randomUUID(),
        vin: `VIN-${suffix}`,
        licensePlate: `PLATE-${suffix}`,
        year: 2025,
        status: 'ACTIVE',
      })
      .expect(400);
  });
});
