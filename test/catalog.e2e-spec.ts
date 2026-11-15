import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

const branchThailand = '20000000-0000-4000-8000-000000000001';
const branchUs = '20000000-0000-4000-8000-000000000002';
const offerThailand = '40000000-0000-4000-8000-000000000001';

describe('Catalog API (PostgreSQL)', () => {
  let app: INestApplication<App>;
  let db: Pool;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL)
      throw new Error(
        'DATABASE_URL must point to the local test PostgreSQL database',
      );
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await db?.end();
  });

  it('filters branches by country and returns only active branch offers', async () => {
    const countries = await request(app.getHttpServer())
      .get('/api/countries')
      .expect(200);
    expect(countries.body.data).toHaveLength(10);
    expect(countries.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'TH' }),
        expect.objectContaining({ code: 'US' }),
      ]),
    );

    const thailand = await request(app.getHttpServer())
      .get('/api/countries/TH/branches')
      .expect(200);
    expect(thailand.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'BKK',
          timezone: 'Asia/Bangkok',
          currencyCode: 'THB',
        }),
        expect.objectContaining({
          code: 'DMK',
          timezone: 'Asia/Bangkok',
          currencyCode: 'THB',
        }),
        expect.objectContaining({
          code: 'HDY',
          timezone: 'Asia/Bangkok',
          currencyCode: 'THB',
        }),
        expect.objectContaining({
          code: 'CNX',
          timezone: 'Asia/Bangkok',
          currencyCode: 'THB',
        }),
      ]),
    );
    const us = await request(app.getHttpServer())
      .get('/api/countries/US/branches')
      .expect(200);
    expect(us.body.data).toMatchObject([
      { code: 'JFK', timezone: 'America/New_York', currencyCode: 'USD' },
    ]);

    await db.query(
      "UPDATE car_type_branch SET is_active = false WHERE branch_id IN (SELECT b.id FROM branch b JOIN country c ON c.id=b.country_id WHERE c.code='TH')",
    );
    try {
      await request(app.getHttpServer())
        .get(`/api/branches/${branchThailand}/offers`)
        .expect(200)
        .expect(({ body }) => expect(body.data).toEqual([]));
      await request(app.getHttpServer())
        .get('/api/countries/TH/branches')
        .expect(200)
        .expect(({ body }) => expect(body.data).toEqual([]));
      const remainingCountries = await request(app.getHttpServer())
        .get('/api/countries')
        .expect(200);
      expect(remainingCountries.body.data).toHaveLength(9);
      expect(remainingCountries.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'US', currencyCode: 'USD' }),
        ]),
      );
      await request(app.getHttpServer())
        .get(`/api/offers/${offerThailand}`)
        .expect(404);
    } finally {
      await db.query(
        "UPDATE car_type_branch SET is_active = true WHERE branch_id IN (SELECT b.id FROM branch b JOIN country c ON c.id=b.country_id WHERE c.code='TH')",
      );
    }
  });

  it('returns branch-specific exact rates and rejects invalid identifiers', async () => {
    const detail = await request(app.getHttpServer())
      .get(`/api/offers/${offerThailand}`)
      .expect(200);
    expect(detail.body.data).toMatchObject({
      id: offerThailand,
      branchId: branchThailand,
      brand: 'Toyota',
      model: 'Camry',
      baseHourlyRate: '180.0000',
      baseDailyRate: '1890.0000',
      currencyCode: 'THB',
      timezone: 'Asia/Bangkok',
      features: ['Air conditioning', 'Apple CarPlay', 'Cruise control'],
    });
    await request(app.getHttpServer())
      .get('/api/branches/not-a-uuid/offers')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/offers/not-a-uuid')
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/branches/${branchUs}/offers`)
      .expect(200);
  });
});
