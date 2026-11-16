import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { Pool } from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { createAppDataSource } from '../src/platform/database/typeorm-data-source';
import { seedMain } from '../src/platform/database/seedings/main.seeding';

const origin = 'http://localhost:3000';
const branchId = '20000000-0000-4000-8000-000000000001';
const newYorkBranchId = '20000000-0000-4000-8000-000000000002';
const offerId = '40000000-0000-4000-8000-000000000001';
const newYorkOfferId = '40000000-0000-4000-8000-000000000002';
const future = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString();

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected an object response');
  return Object.fromEntries(Object.entries(value));
}

function objects(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Expected an array response');
  return value.map(object);
}

function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new Error('Expected an integer response');
  return value;
}

describe('Booking API (isolated PostgreSQL)', () => {
  let app: INestApplication<App>;
  let db: Pool;
  let adminCookie: string;

  beforeAll(async () => {
    const url = process.env.BOOKING_TEST_DATABASE_URL;
    if (!url || new URL(url).pathname !== '/funch_booking_test')
      throw new Error(
        'BOOKING_TEST_DATABASE_URL must target the isolated funch_booking_test database',
      );
    process.env.DATABASE_URL = url;
    const source = createAppDataSource();
    await source.initialize();
    await source.runMigrations();
    await seedMain(source);
    await source.destroy();
    db = new Pool({ connectionString: url });
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableCors({ origin, credentials: true });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await db?.end();
  });

  beforeEach(async () => {
    await db.query('TRUNCATE booking CASCADE');
    await db.query("DELETE FROM car_option WHERE code LIKE 'BOOKING-%'");
    await db.query("DELETE FROM app_user WHERE email LIKE '%@booking.test'");
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({
        name: 'Booking Admin',
        email: `${randomUUID()}@booking.test`,
        password: 'long-enough-booking-password',
        phone: '+66123456789',
      })
      .expect(201);
    adminCookie = response.headers['set-cookie'][0].split(';')[0];
    await db.query(
      "UPDATE app_user SET role='ADMIN' WHERE email LIKE '%@booking.test' AND name='Booking Admin'",
    );
  });

  async function createBooking(
    options: Array<{ carOptionId: string; quantity: number }> = [],
    pickupAt = future(3),
    returnAt = future(4),
    bookingOfferId = offerId,
  ) {
    const checkoutKey = randomUUID();
    const customerEmail = `${randomUUID()}@booking.test`;
    const customerPassword = 'long-enough-booking-password';
    const response = await request(app.getHttpServer())
      .post('/api/bookings/register-checkout')
      .set('Origin', origin)
      .send({
        offerId: bookingOfferId,
        pickupAt,
        returnAt,
        options,
        checkoutKey,
        customerName: 'Booking Customer',
        customerEmail,
        customerPassword,
        customerPhone: '+66123456789',
      })
      .expect(201);
    return {
      id: response.body.data.id as string,
      cookie: response.headers['set-cookie'][0].split(';')[0],
      input: {
        offerId: bookingOfferId,
        pickupAt,
        returnAt,
        options,
        checkoutKey,
      },
      customerEmail,
      customerPassword,
    };
  }

  it('quotes on the server and creates one pending booking for repeated checkout submissions', async () => {
    const item = await createBooking([], future(1), future(2));
    expect(item.id).toBeTruthy();
    await request(app.getHttpServer())
      .post('/api/bookings/register-checkout')
      .set('Origin', origin)
      .send({
        ...item.input,
        customerEmail: item.customerEmail,
        customerPassword: 'wrong-password-that-is-long',
      })
      .expect(401);
    const retry = await request(app.getHttpServer())
      .post('/api/bookings/register-checkout')
      .set('Origin', origin)
      .send({
        ...item.input,
        customerEmail: item.customerEmail,
        customerPassword: item.customerPassword,
      })
      .expect(201);
    expect(retry.body.data.id).toBe(item.id);
    await request(app.getHttpServer())
      .get(`/api/bookings/${item.id}`)
      .set('Cookie', retry.headers['set-cookie'][0].split(';')[0])
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/bookings')
      .set('Origin', origin)
      .set('Cookie', item.cookie)
      .send(item.input)
      .expect(201);
    const rows = await db.query(
      'SELECT status,car_id,rental_subtotal,total_amount FROM booking WHERE checkout_key=$1',
      [item.input.checkoutKey],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({ status: 'PENDING', car_id: null });
    await request(app.getHttpServer())
      .get(`/api/bookings/${item.id}`)
      .set('Cookie', item.cookie)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/bookings/${item.id}`)
      .set('Cookie', adminCookie)
      .expect(200);
    const quote = await request(app.getHttpServer())
      .post('/api/bookings/quote')
      .send({ offerId, pickupAt: future(3), returnAt: future(4), options: [] })
      .expect(201);
    expect(quote.body.data).toMatchObject({
      currencyCode: 'THB',
      chargedDays: 1,
      availableVehicles: 1,
    });
    const snapshot = (
      await db.query(
        'SELECT daily_rate_at_booking::text AS daily,total_amount::text AS total FROM booking WHERE id=$1',
        [item.id],
      )
    ).rows[0];
    await db.query(
      'UPDATE car_type_branch SET base_daily_rate=9999 WHERE id=$1',
      [offerId],
    );
    try {
      const details = await request(app.getHttpServer())
        .get(`/api/bookings/${item.id}`)
        .set('Cookie', item.cookie)
        .expect(200);
      expect(details.body.data.dailyRateAtBooking).toBe(snapshot.daily);
      expect(details.body.data.totalAmount).toBe(snapshot.total);
    } finally {
      await db.query(
        'UPDATE car_type_branch SET base_daily_rate=1890 WHERE id=$1',
        [offerId],
      );
    }
  });

  it('reserves capacity on pending checkout and releases it when rejected by admin', async () => {
    const a = await createBooking();
    const checkoutKey = randomUUID();
    const failResponse = await request(app.getHttpServer())
      .post('/api/bookings/register-checkout')
      .set('Origin', origin)
      .send({
        offerId,
        pickupAt: future(3),
        returnAt: future(4),
        options: [],
        checkoutKey,
        customerName: 'Second Customer',
        customerEmail: `${randomUUID()}@booking.test`,
        customerPassword: 'long-enough-booking-password',
        customerPhone: '+66123456789',
      });
    expect(failResponse.status).toBe(409);

    await request(app.getHttpServer())
      .post(`/api/admin/bookings/${a.id}/reject`)
      .set('Cookie', adminCookie)
      .send({ reason: 'Admin rejected request' })
      .expect(201);

    const retryResponse = await request(app.getHttpServer())
      .post('/api/bookings/register-checkout')
      .set('Origin', origin)
      .send({
        offerId,
        pickupAt: future(3),
        returnAt: future(4),
        options: [],
        checkoutKey,
        customerName: 'Second Customer',
        customerEmail: `${randomUUID()}@booking.test`,
        customerPassword: 'long-enough-booking-password',
        customerPhone: '+66123456789',
      });
    expect(retryResponse.status).toBe(201);
    expect(retryResponse.body.data.status).toBe('PENDING');
  });

  it('reports branch-local daily reserved and pending fleet peaks for the current or a future month', async () => {
    const monthStart = DateTime.now()
      .setZone('Asia/Bangkok')
      .plus({ months: 1 })
      .startOf('month');
    const pickup = monthStart.plus({ days: 5, hours: 8 });
    const booking = await createBooking(
      [],
      pickup.toUTC().toISO()!,
      pickup.plus({ hours: 4 }).toUTC().toISO()!,
    );
    const month = monthStart.toFormat('yyyy-MM');

    await request(app.getHttpServer())
      .get(`/api/admin/fleet/timeline?branchId=${branchId}&month=${month}`)
      .expect(401);
    const response = await request(app.getHttpServer())
      .get(`/api/admin/fleet/timeline?branchId=${branchId}&month=${month}`)
      .set('Cookie', adminCookie)
      .expect(200);
    const data = object(response.body.data);
    const offer = objects(data.matrix).find(
      (item) => item.carTypeBranchId === offerId,
    );
    if (!offer)
      throw new Error('Expected the booked offer in the fleet matrix');
    const day = objects(offer.days).find(
      (item) => item.date === pickup.toISODate(),
    );
    if (!day) throw new Error('Expected the pickup day in the fleet matrix');
    expect(data).toMatchObject({
      month,
      branch: { id: branchId, timezone: 'Asia/Bangkok' },
    });
    expect(booking.id).toBeTruthy();
    const peakPending = integer(day.peakPending);
    const peakReserved = integer(day.peakReserved);
    const totalCapacity = integer(day.totalCapacity);
    expect(peakPending).toBeGreaterThanOrEqual(1);
    expect(peakReserved).toBeGreaterThanOrEqual(peakPending);
    expect(integer(day.available)).toBe(
      Math.max(0, totalCapacity - peakReserved),
    );

    await request(app.getHttpServer())
      .get(`/api/admin/fleet/timeline?branchId=${branchId}&month=2026-13`)
      .set('Cookie', adminCookie)
      .expect(400);
    const pastMonth = DateTime.now()
      .setZone('Asia/Bangkok')
      .minus({ months: 1 })
      .toFormat('yyyy-MM');
    await request(app.getHttpServer())
      .get(`/api/admin/fleet/timeline?branchId=${branchId}&month=${pastMonth}`)
      .set('Cookie', adminCookie)
      .expect(400);
  });

  it('keeps New York DST transition bookings in the correct local calendar day', async () => {
    const springPickup = DateTime.fromISO('2027-03-15T00:30:00', {
      zone: 'America/New_York',
    });
    const fallPickup = DateTime.fromISO('2027-11-07T23:30:00', {
      zone: 'America/New_York',
    });
    await createBooking(
      [],
      springPickup.toUTC().toISO()!,
      springPickup.plus({ hours: 1 }).toUTC().toISO()!,
      newYorkOfferId,
    );
    await createBooking(
      [],
      fallPickup.toUTC().toISO()!,
      fallPickup.plus({ hours: 1 }).toUTC().toISO()!,
      newYorkOfferId,
    );

    const march = await request(app.getHttpServer())
      .get(
        `/api/admin/fleet/timeline?branchId=${newYorkBranchId}&month=2027-03`,
      )
      .set('Cookie', adminCookie)
      .expect(200);
    const marchOffer = objects(object(march.body.data).matrix).find(
      (item) => item.carTypeBranchId === newYorkOfferId,
    );
    if (!marchOffer) throw new Error('Expected the New York fleet row');
    const marchDays = objects(marchOffer.days);
    expect(
      integer(marchDays.find((day) => day.date === '2027-03-14')?.peakPending),
    ).toBe(0);
    expect(
      integer(marchDays.find((day) => day.date === '2027-03-15')?.peakPending),
    ).toBeGreaterThanOrEqual(1);

    const november = await request(app.getHttpServer())
      .get(
        `/api/admin/fleet/timeline?branchId=${newYorkBranchId}&month=2027-11`,
      )
      .set('Cookie', adminCookie)
      .expect(200);
    const novemberOffer = objects(object(november.body.data).matrix).find(
      (item) => item.carTypeBranchId === newYorkOfferId,
    );
    if (!novemberOffer) throw new Error('Expected the New York fleet row');
    const novemberDay = objects(novemberOffer.days).find(
      (day) => day.date === '2027-11-07',
    );
    expect(integer(novemberDay?.peakPending)).toBeGreaterThanOrEqual(1);
  });

  it('reserves option stock on pending checkout and releases it when rejected by admin', async () => {
    const optionId = randomUUID();
    await db.query(
      `INSERT INTO car_option(id,branch_id,code,name,description,category,pricing_type,price,quantity_stock) VALUES($1,'20000000-0000-4000-8000-000000000001',$2,'Booking seat','Shared test stock','EQUIPMENT','PER_UNIT_PER_DAY','10',1)`,
      [optionId, `BOOKING-${optionId.slice(0, 8)}`],
    );
    await db.query(
      'UPDATE car_type_branch SET supported_option_ids = array_append(supported_option_ids, $1) WHERE id=$2',
      [optionId, offerId],
    );
    const secondCar = randomUUID();
    await db.query(
      `INSERT INTO car(id,car_type_branch_id,vin,license_plate,year,status) VALUES($1,$2,$3,$4,2026,'ACTIVE')`,
      [
        secondCar,
        offerId,
        `BOOK-${secondCar}`,
        `BOOK-${secondCar.slice(0, 8)}`,
      ],
    );
    try {
      const a = await createBooking([{ carOptionId: optionId, quantity: 1 }]);
      const failResponse = await request(app.getHttpServer())
        .post('/api/bookings/register-checkout')
        .set('Origin', origin)
        .send({
          offerId,
          pickupAt: future(3),
          returnAt: future(4),
          options: [{ carOptionId: optionId, quantity: 1 }],
          checkoutKey: randomUUID(),
          customerName: 'Second Option Customer',
          customerEmail: `${randomUUID()}@booking.test`,
          customerPassword: 'long-enough-booking-password',
          customerPhone: '+66123456789',
        });
      expect(failResponse.status).toBe(409);

      await request(app.getHttpServer())
        .post(`/api/admin/bookings/${a.id}/reject`)
        .set('Cookie', adminCookie)
        .send({ reason: 'Admin rejected request' })
        .expect(201);

      const retryResponse = await request(app.getHttpServer())
        .post('/api/bookings/register-checkout')
        .set('Origin', origin)
        .send({
          offerId,
          pickupAt: future(3),
          returnAt: future(4),
          options: [{ carOptionId: optionId, quantity: 1 }],
          checkoutKey: randomUUID(),
          customerName: 'Second Option Customer',
          customerEmail: `${randomUUID()}@booking.test`,
          customerPassword: 'long-enough-booking-password',
          customerPhone: '+66123456789',
        });
      expect(retryResponse.status).toBe(201);
    } finally {
      await db.query('DELETE FROM car WHERE id=$1', [secondCar]);
      await db.query(
        'UPDATE car_type_branch SET supported_option_ids = array_remove(supported_option_ids, $1) WHERE id=$2',
        [optionId, offerId],
      );
      await db.query('DELETE FROM booking_option WHERE car_option_id=$1', [
        optionId,
      ]);
      await db.query('DELETE FROM car_option WHERE id=$1', [optionId]);
    }
  });

  it('enforces owner-only access and releases a cancelled pending request', async () => {
    const own = await createBooking([], future(1), future(2));
    const other = await createBooking([], future(3), future(4));
    await request(app.getHttpServer())
      .get(`/api/bookings/${own.id}`)
      .set('Cookie', other.cookie)
      .expect(403);
    const scheduled = await createBooking([], future(5), future(6));
    await db.query('UPDATE booking SET pickup_at=now() WHERE id=$1', [
      scheduled.id,
    ]);
    await request(app.getHttpServer())
      .post(`/api/bookings/${scheduled.id}/cancel`)
      .set('Cookie', scheduled.cookie)
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/bookings/${own.id}/cancel`)
      .set('Cookie', own.cookie)
      .expect(201);
    const result = await db.query(
      'SELECT status,total_amount FROM booking WHERE id=$1',
      [own.id],
    );
    expect(result.rows[0].status).toBe('CANCELLED');
  });

  it('assigns a real car only at pickup time and lets admins cancel an overdue no-show with a reason', async () => {
    const item = await createBooking();
    await db.query(
      `UPDATE booking SET status='APPROVED',pickup_at=now()+interval '1 hour',approved_by=(SELECT id FROM app_user WHERE email LIKE '%@booking.test' AND role='ADMIN' LIMIT 1),approved_at=now() WHERE id=$1`,
      [item.id],
    );
    await request(app.getHttpServer())
      .post(`/api/admin/bookings/${item.id}/pickup`)
      .set('Cookie', adminCookie)
      .send({ carId: '50000000-0000-4000-8000-000000000001' })
      .expect(409);
    await db.query(
      `UPDATE booking SET pickup_at=now()-interval '1 minute' WHERE id=$1`,
      [item.id],
    );
    await request(app.getHttpServer())
      .post(`/api/admin/bookings/${item.id}/pickup`)
      .set('Cookie', adminCookie)
      .send({ carId: '50000000-0000-4000-8000-000000000001' })
      .expect(201)
      .expect(({ body }) => expect(body.data.status).toBe('IN_USE'));

    const noShow = await createBooking([], future(5), future(6));
    await db.query(
      `UPDATE booking SET pickup_at=now()-interval '1 minute' WHERE id=$1`,
      [noShow.id],
    );
    await request(app.getHttpServer())
      .post(`/api/admin/bookings/${noShow.id}/cancel`)
      .set('Cookie', adminCookie)
      .send({ reason: 'Customer did not arrive' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/admin/bookings/${noShow.id}/cancel`)
      .set('Cookie', adminCookie)
      .send({ reason: 'Repeat no-show' })
      .expect(409);
  });

  it('flags approved bookings that conflict with a delayed physical return cooldown', async () => {
    const inUse = await createBooking([], future(1), future(2));
    const approved = await createBooking([], future(3), future(4));
    await db.query(
      `UPDATE booking SET status='IN_USE',car_id='50000000-0000-4000-8000-000000000001',pickup_at=now()-interval '1 hour',return_at=now()+interval '1 hour' WHERE id=$1`,
      [inUse.id],
    );
    await db.query(
      `UPDATE booking SET status='APPROVED',pickup_at=now()+interval '30 minutes',return_at=now()+interval '2 hours' WHERE id=$1`,
      [approved.id],
    );
    const returned = await request(app.getHttpServer())
      .post(`/api/admin/bookings/${inUse.id}/return`)
      .set('Cookie', adminCookie)
      .send({ charges: [] })
      .expect(201);
    expect(returned.body.data.capacityConflictBookingIds).toContain(
      approved.id,
    );
    expect(
      (await db.query('SELECT status FROM booking WHERE id=$1', [approved.id]))
        .rows[0].status,
    ).toBe('APPROVED');
  });

  it('records actual return charges once, completes transactionally, and reports booking and extra values separately', async () => {
    const item = await createBooking();
    await db.query(
      `UPDATE booking SET status='IN_USE',car_id='50000000-0000-4000-8000-000000000001',pickup_at=now()-interval '3 days',return_at=now()-interval '1 day' WHERE id=$1`,
      [item.id],
    );
    await request(app.getHttpServer())
      .post(`/api/admin/bookings/${item.id}/confirm-return`)
      .set('Cookie', adminCookie)
      .expect(409);
    const preview = await request(app.getHttpServer())
      .get(`/api/admin/bookings/${item.id}/return-preview`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(Number(preview.body.data.projectedFinalAmount)).toBeGreaterThan(
      Number(preview.body.data.bookingAmount),
    );
    await request(app.getHttpServer())
      .post(`/api/admin/bookings/${item.id}/return`)
      .set('Cookie', adminCookie)
      .send({
        charges: [
          { type: 'DAMAGE', description: 'Bumper repair', amount: '100.00' },
        ],
      })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/api/admin/bookings/${item.id}/return-preview`)
      .set('Cookie', adminCookie)
      .expect(409);
    const repeated = await request(app.getHttpServer())
      .post(`/api/admin/bookings/${item.id}/return`)
      .set('Cookie', adminCookie)
      .send({
        charges: [
          { type: 'DAMAGE', description: 'Bumper repair', amount: '100.00' },
        ],
      })
      .expect(201);
    expect(repeated.body.data.lines).toBeDefined();
    const unresolved = await request(app.getHttpServer())
      .post(`/api/admin/bookings/${item.id}/confirm-return`)
      .set('Cookie', adminCookie)
      .expect(409);
    expect(unresolved.body.status.messages).toContain('pending charges');
    const chargeId = (
      await db.query(
        "SELECT id FROM additional_charge WHERE booking_id=$1 AND type='DAMAGE'",
        [item.id],
      )
    ).rows[0].id as string;
    await request(app.getHttpServer())
      .post(`/api/admin/bookings/${item.id}/charges/${chargeId}/confirm`)
      .set('Cookie', adminCookie)
      .expect(201);
    const review = await request(app.getHttpServer())
      .get('/api/admin/bookings')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(review.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: item.id,
          actualReturnAt: expect.any(String),
          finalAmount: expect.any(String),
          customerPhone: expect.any(String),
          branchId: expect.any(String),
          timezone: expect.any(String),
        }),
      ]),
    );
    await request(app.getHttpServer())
      .post(`/api/admin/bookings/${item.id}/confirm-return`)
      .set('Cookie', adminCookie)
      .expect(201)
      .expect(({ body }) => expect(body.data.status).toBe('COMPLETED'));
    const amounts = await db.query(
      `SELECT b.total_amount::text AS booking, sum(a.amount)::text AS extras, count(*)::int AS lines FROM booking b JOIN additional_charge a ON a.booking_id=b.id WHERE b.id=$1 GROUP BY b.id`,
      [item.id],
    );
    expect(Number(amounts.rows[0].extras)).toBeGreaterThan(100);
    expect(amounts.rows[0].lines).toBe(2);
    const report = await request(app.getHttpServer())
      .get(
        `/api/admin/reports/bookings?createdFrom=${encodeURIComponent(future(-1))}&createdTo=${encodeURIComponent(future(1))}&countryCode=TH&branchId=20000000-0000-4000-8000-000000000001`,
      )
      .set('Cookie', adminCookie)
      .expect(200);
    expect(report.body.data.bookingCounts).toContainEqual({
      branchId: expect.any(String),
      status: 'COMPLETED',
      count: 1,
    });
    const data = report.body.data as {
      confirmedAdditionalChargeValues: Array<{
        currency: string;
        amount: string;
      }>;
    };
    const confirmedExtras = data.confirmedAdditionalChargeValues.find(
      (row) => row.currency === 'THB',
    );
    if (!confirmedExtras) throw new Error('Expected confirmed THB charges');
    expect(Number(confirmedExtras.amount)).toBeGreaterThan(100);
  });

  it('lets admins inspect and suspend members while revoking their sessions without deleting booking history', async () => {
    const item = await createBooking();
    const email = (
      await db.query(
        'SELECT email FROM app_user WHERE id=(SELECT user_id FROM booking WHERE id=$1)',
        [item.id],
      )
    ).rows[0].email as string;
    const memberId = (
      await db.query('SELECT id FROM app_user WHERE email=$1', [email])
    ).rows[0].id as string;
    await request(app.getHttpServer())
      .get(`/api/admin/members/${memberId}`)
      .set('Cookie', adminCookie)
      .expect(200)
      .expect(({ body }) => expect(body.data.bookings).toHaveLength(1));
    await request(app.getHttpServer())
      .patch(`/api/admin/members/${memberId}/suspension`)
      .set('Cookie', adminCookie)
      .send({ isSuspended: true })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/bookings/me')
      .set('Cookie', item.cookie)
      .expect(401);
    await request(app.getHttpServer())
      .patch(`/api/admin/members/${memberId}/suspension`)
      .set('Cookie', adminCookie)
      .send({ isSuspended: false })
      .expect(200);
    const history = await db.query(
      'SELECT count(*)::int AS count FROM booking WHERE user_id=$1',
      [memberId],
    );
    expect(history.rows[0].count).toBe(1);
  });
});
