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
    await db.runMigrations();
    await seedMain(db);
    await db.transaction(async (manager) => {
      const demoIds = DEMO_USERS.map((user) => user.id);
      await manager.query(
        `DELETE FROM additional_charge WHERE booking_id IN (SELECT id FROM booking WHERE user_id=ANY($1::uuid[]))`,
        [demoIds],
      );
      await manager.query(`DELETE FROM booking WHERE user_id=ANY($1::uuid[])`, [
        demoIds,
      ]);
      await manager.query(
        `DELETE FROM user_session WHERE user_id=ANY($1::uuid[])`,
        [demoIds],
      );
      await manager.query(`DELETE FROM app_user WHERE id=ANY($1::uuid[])`, [
        demoIds,
      ]);
      await manager.query(`DELETE FROM car_option WHERE id=ANY($1::uuid[])`, [
        DEMO_OPTIONS.map((option) => option.id),
      ]);
      const passwords = new PasswordService();
      for (const user of DEMO_USERS)
        await manager.query(
          `INSERT INTO app_user(id,email,password_hash,name,phone,role,is_suspended) VALUES($1,$2,$3,$4,$5,$6,false)`,
          [
            user.id,
            user.email,
            await passwords.hash('FunchDemo2026!'),
            user.name,
            user.phone,
            user.role,
          ],
        );
      for (const option of DEMO_OPTIONS)
        await manager.query(
          `INSERT INTO car_option(id,branch_id,code,name,description,category,pricing_type,price,quantity_stock) VALUES($1,$2,$3,'Demo child seat','One unit available for the demo','EQUIPMENT','PER_UNIT_PER_DAY',$4,$5)`,
          [option.id, option.branch, option.code, option.price, option.stock],
        );

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
        const offer = (
          await manager.query<Record<string, string>[]>(
            `SELECT o.id,o.branch_id AS branch,o.base_daily_rate::text AS daily,o.base_hourly_rate::text AS hourly,o.currency_code AS currency,b.timezone FROM car_type_branch o JOIN branch b ON b.id=o.branch_id WHERE o.id=$1`,
            [fixture.offer],
          )
        )[0];
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
        await manager.query(
          `INSERT INTO booking(id,booking_number,checkout_key,user_id,car_type_branch_id,car_id,pickup_branch_id,return_branch_id,pickup_at,return_at,actual_return_at,status,currency_code,daily_rate_at_booking,hourly_rate_at_booking,charged_days,charged_hours,rental_subtotal,options_subtotal,total_amount,approved_by,approved_at,rejection_reason,cancellation_reason)
           VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
          [
            id,
            `DEMO-${String(index + 1).padStart(3, '0')}`,
            randomUUID(),
            DEMO_USERS[0].id,
            fixture.offer,
            fixture.car,
            offer.branch,
            fixture.pickup,
            fixture.ret,
            fixture.actual,
            fixture.status,
            offer.currency,
            offer.daily,
            offer.hourly,
            rental.chargedDays,
            rental.chargedHours,
            total.rentalSubtotal.amount,
            total.optionsSubtotal.amount,
            total.totalAmount.amount,
            fixture.status === 'APPROVED' ||
            fixture.status === 'IN_USE' ||
            fixture.status === 'COMPLETED'
              ? DEMO_USERS[1].id
              : null,
            fixture.status === 'APPROVED' ||
            fixture.status === 'IN_USE' ||
            fixture.status === 'COMPLETED'
              ? new Date()
              : null,
            fixture.status === 'REJECTED' ? fixture.reason : null,
            fixture.status === 'CANCELLED' ? fixture.reason : null,
          ],
        );
        if (fixture.option && line)
          await manager.query(
            `INSERT INTO booking_option(id,booking_id,car_option_id,quantity,unit_price_at_booking,charged_units,total_amount) VALUES($1,$2,$3,1,$4,$5,$6)`,
            [
              randomUUID(),
              id,
              fixture.option.id,
              fixture.option.price,
              line.chargedUnits,
              line.totalAmount.amount,
            ],
          );
        if (fixture.status === 'COMPLETED')
          await manager.query(
            `INSERT INTO additional_charge(id,booking_id,type,description,quantity,unit_price,amount,status,created_by) VALUES($1,$2,'DAMAGE','Demo confirmed damage charge',1,'250.00','250.00','CONFIRMED',$3)`,
            [randomUUID(), id, DEMO_USERS[1].id],
          );
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
