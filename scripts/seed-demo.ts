import { randomUUID } from 'node:crypto';
import { PasswordService } from '../src/modules/auth/services/password.service';
import { createAppDataSource } from '../src/platform/database/typeorm-data-source';
import { seedMain } from '../src/platform/database/seedings/main.seeding';
import {
  calculateBookingTotal,
  calculateOptionPrice,
  calculateRentalPrice,
} from '../src/core';

const DEMO_USERS = [
  {
    id: '60000000-0000-4000-8000-000000000001',
    name: 'Demo Customer',
    email: 'demo-customer@example.test',
    phone: '+66123456789',
    role: 'CUSTOMER',
  },
  {
    id: '60000000-0000-4000-8000-000000000002',
    name: 'Demo Administrator',
    email: 'demo-admin@example.test',
    phone: '+66123456780',
    role: 'ADMIN',
  },
];
const DEMO_OPTIONS = [
  {
    id: '70000000-0000-4000-8000-000000000001',
    branch: '20000000-0000-4000-8000-000000000001',
    code: 'DEMO-SEAT-TH',
    currency: 'THB',
    price: '100',
    stock: 1,
  },
  {
    id: '70000000-0000-4000-8000-000000000002',
    branch: '20000000-0000-4000-8000-000000000002',
    code: 'DEMO-SEAT-US',
    currency: 'USD',
    price: '5',
    stock: 1,
  },
];
const BOOKING_IDS = [
  '80000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000002',
  '80000000-0000-4000-8000-000000000003',
  '80000000-0000-4000-8000-000000000004',
  '80000000-0000-4000-8000-000000000005',
  '80000000-0000-4000-8000-000000000006',
];
const day = 86_400_000;
const at = (offset: number) =>
  new Date(Date.now() + offset * day).toISOString();

async function seedDemo() {
  const url = process.env.DEMO_DATABASE_URL;
  if (!url || new URL(url).pathname !== '/funch_demo')
    throw new Error(
      'DEMO_DATABASE_URL must target the isolated funch_demo database',
    );
  process.env.DATABASE_URL = url;
  const db = createAppDataSource();
  await db.initialize();
  try {
    await seedMain(db);
    await db.transaction(async (manager) => {
      const demoIds = DEMO_USERS.map((user) => user.id);
      const oldBookings = await manager
        .createQueryBuilder()
        .select('b.id', 'id')
        .from('booking', 'b')
        .where('b.user_id IN (:...demoIds)', { demoIds })
        .getRawMany<{ id: string }>();
      const oldBookingIds = oldBookings.map(({ id }) => id);
      if (oldBookingIds.length)
        await manager
          .createQueryBuilder()
          .delete()
          .from('additional_charge')
          .where('booking_id IN (:...oldBookingIds)', { oldBookingIds })
          .execute();
      await manager
        .createQueryBuilder()
        .delete()
        .from('booking')
        .where('user_id IN (:...demoIds)', { demoIds })
        .execute();
      await manager
        .createQueryBuilder()
        .delete()
        .from('user_session')
        .where('user_id IN (:...demoIds)', { demoIds })
        .execute();
      await manager
        .createQueryBuilder()
        .delete()
        .from('app_user')
        .where('id IN (:...demoIds)', { demoIds })
        .execute();
      await manager
        .createQueryBuilder()
        .delete()
        .from('car_option')
        .where('id IN (:...optionIds)', {
          optionIds: DEMO_OPTIONS.map((option) => option.id),
        })
        .execute();
      const passwords = new PasswordService();
      for (const user of DEMO_USERS)
        await manager
          .createQueryBuilder()
          .insert()
          .into('app_user')
          .values({
            id: user.id,
            email: user.email,
            password_hash: await passwords.hash('FunchDemo2026!'),
            name: user.name,
            phone: user.phone,
            role: user.role,
            is_suspended: false,
          })
          .execute();
      for (const option of DEMO_OPTIONS)
        await manager
          .createQueryBuilder()
          .insert()
          .into('car_option')
          .values({
            id: option.id,
            branch_id: option.branch,
            code: option.code,
            name: 'Demo child seat',
            description: 'One unit available for the demo',
            category: 'EQUIPMENT',
            pricing_type: 'PER_UNIT_PER_DAY',
            price: option.price,
            quantity_stock: option.stock,
          })
          .execute();

      const fixtures = [
        {
          status: 'PENDING',
          offer: '40000000-0000-4000-8000-000000000002',
          car: null,
          pickup: at(1),
          ret: at(2),
          option: DEMO_OPTIONS[1],
          reason: null,
          actual: null,
        },
        {
          status: 'APPROVED',
          offer: '40000000-0000-4000-8000-000000000002',
          car: null,
          pickup: at(3),
          ret: at(4),
          option: DEMO_OPTIONS[1],
          reason: null,
          actual: null,
        },
        {
          status: 'IN_USE',
          offer: '40000000-0000-4000-8000-000000000001',
          car: '50000000-0000-4000-8000-000000000001',
          pickup: at(-1 / 12),
          ret: at(1),
          option: DEMO_OPTIONS[0],
          reason: null,
          actual: null,
        },
        {
          status: 'COMPLETED',
          offer: '40000000-0000-4000-8000-000000000001',
          car: '50000000-0000-4000-8000-000000000001',
          pickup: at(-5),
          ret: at(-3),
          option: DEMO_OPTIONS[0],
          reason: null,
          actual: at(-3 + 2 / 24),
        },
        {
          status: 'CANCELLED',
          offer: '40000000-0000-4000-8000-000000000001',
          car: null,
          pickup: at(5),
          ret: at(6),
          option: null,
          reason: 'Customer cancelled before pickup',
          actual: null,
        },
        {
          status: 'REJECTED',
          offer: '40000000-0000-4000-8000-000000000002',
          car: null,
          pickup: at(6),
          ret: at(7),
          option: null,
          reason: 'Capacity unavailable',
          actual: null,
        },
      ];
      for (let index = 0; index < fixtures.length; index++) {
        const fixture = fixtures[index];
        const offer = await manager
          .createQueryBuilder()
          .select([
            'o.id AS id',
            'o.branch_id AS branch',
            'o.base_daily_rate::text AS daily',
            'o.base_hourly_rate::text AS hourly',
            'o.currency_code AS currency',
            'b.timezone AS timezone',
          ])
          .from('car_type_branch', 'o')
          .innerJoin('branch', 'b', 'b.id = o.branch_id')
          .where('o.id = :offerId', { offerId: fixture.offer })
          .getRawOne<Record<string, string>>();
        if (!offer) throw new Error(`Missing demo offer ${fixture.offer}`);
        const rental = calculateRentalPrice({
          pickupAt: fixture.pickup,
          returnAt: fixture.ret,
          branchTimeZone: offer.timezone,
          hourlyRate: { amount: offer.hourly, currency: offer.currency },
          dailyRate: { amount: offer.daily, currency: offer.currency },
        });
        const line = fixture.option
          ? calculateOptionPrice({
              pickupAt: fixture.pickup,
              returnAt: fixture.ret,
              pricingType: 'PER_UNIT_PER_DAY',
              unitPrice: {
                amount: fixture.option.price,
                currency: offer.currency,
              },
              quantity: 1,
            })
          : null;
        const total = calculateBookingTotal({
          rentalPrice: rental.rentalSubtotal,
          optionPrices: line ? [line.totalAmount] : [],
        });
        const id = BOOKING_IDS[index];
        await manager
          .createQueryBuilder()
          .insert()
          .into('booking')
          .values({
            id,
            booking_number: `DEMO-${String(index + 1).padStart(3, '0')}`,
            checkout_key: randomUUID(),
            user_id: DEMO_USERS[0].id,
            car_type_branch_id: fixture.offer,
            car_id: fixture.car,
            pickup_branch_id: offer.branch,
            return_branch_id: offer.branch,
            pickup_at: fixture.pickup,
            return_at: fixture.ret,
            actual_return_at: fixture.actual,
            status: fixture.status,
            currency_code: offer.currency,
            daily_rate_at_booking: offer.daily,
            hourly_rate_at_booking: offer.hourly,
            charged_days: rental.chargedDays,
            charged_hours: rental.chargedHours,
            rental_subtotal: total.rentalSubtotal.amount,
            options_subtotal: total.optionsSubtotal.amount,
            total_amount: total.totalAmount.amount,
            approved_by:
              fixture.status === 'APPROVED' ||
              fixture.status === 'IN_USE' ||
              fixture.status === 'COMPLETED'
                ? DEMO_USERS[1].id
                : null,
            approved_at:
              fixture.status === 'APPROVED' ||
              fixture.status === 'IN_USE' ||
              fixture.status === 'COMPLETED'
                ? new Date()
                : null,
            rejection_reason:
              fixture.status === 'REJECTED' ? fixture.reason : null,
            cancellation_reason:
              fixture.status === 'CANCELLED' ? fixture.reason : null,
          })
          .execute();
        if (fixture.option && line)
          await manager
            .createQueryBuilder()
            .insert()
            .into('booking_option')
            .values({
              id: randomUUID(),
              booking_id: id,
              car_option_id: fixture.option.id,
              quantity: 1,
              unit_price_at_booking: fixture.option.price,
              charged_units: line.chargedUnits,
              total_amount: line.totalAmount.amount,
            })
            .execute();
        if (fixture.status === 'COMPLETED')
          await manager
            .createQueryBuilder()
            .insert()
            .into('additional_charge')
            .values({
              id: randomUUID(),
              booking_id: id,
              type: 'DAMAGE',
              description: 'Demo confirmed damage charge',
              quantity: 1,
              unit_price: '250.00',
              amount: '250.00',
              status: 'CONFIRMED',
              created_by: DEMO_USERS[1].id,
            })
            .execute();
      }
    });
    process.stdout.write(
      'Demo data seeded: demo-customer@example.test / demo-admin@example.test, password FunchDemo2026!\n',
    );
  } finally {
    await db.destroy();
  }
}

void seedDemo().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
