import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PasswordService } from '../src/modules/auth/services/password.service';
import { StorageService } from '../src/platform/storage/storage.service';
import { createAppDataSource } from '../src/platform/database/typeorm-data-source';
import { seedMain } from '../src/platform/database/seedings/main.seeding';
import { BookingStatus } from '../src/modules/bookings/enums/booking-status.enum';
import {
  calculateBookingTotal,
  calculateOptionPrice,
  calculateRentalPrice,
} from '../src/core';

const DEMO_USERS = [
  {
    id: '60000000-0000-4000-8000-000000000001',
    name: 'Nicha Srisuk',
    email: 'demo-customer@example.test',
    phone: '+66123456789',
    role: 'CUSTOMER',
    isSuspended: false,
  },
  {
    id: '60000000-0000-4000-8000-000000000002',
    name: 'Demo Administrator',
    email: 'demo-admin@example.test',
    phone: '+66123456780',
    role: 'ADMIN',
    isSuspended: false,
  },
  {
    id: '60000000-0000-4000-8000-000000000003',
    name: 'Kawin Rattanakul',
    email: 'demo-customer-2@example.test',
    phone: '+66123456781',
    role: 'CUSTOMER',
    isSuspended: false,
  },
  {
    id: '60000000-0000-4000-8000-000000000004',
    name: 'Pimchanok Wattanapong',
    email: 'demo-suspended@example.test',
    phone: '+66123456782',
    role: 'CUSTOMER',
    isSuspended: true,
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
const ADMIN_ID = DEMO_USERS[1].id;
const CAR_TYPE_IDS = [
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
];
const DEMO_IMAGES = [
  {
    id: '90000000-0000-4000-8000-000000000001',
    carTypeId: CAR_TYPE_IDS[0],
    filename: 'camry-front.jpg',
  },
  {
    id: '90000000-0000-4000-8000-000000000002',
    carTypeId: CAR_TYPE_IDS[0],
    filename: 'camry-side.jpg',
  },
  {
    id: '90000000-0000-4000-8000-000000000003',
    carTypeId: CAR_TYPE_IDS[1],
    filename: 'model-3-white.jpg',
  },
  {
    id: '90000000-0000-4000-8000-000000000004',
    carTypeId: CAR_TYPE_IDS[1],
    filename: 'model-3-back.jpg',
  },
];
type DemoBookingFixture = {
  status: BookingStatus;
  customer: number;
  offer: string;
  car: string | null;
  pickup: number;
  ret: number;
  created: number;
  option: (typeof DEMO_OPTIONS)[number] | null;
  actual?: number;
  reason?: string;
  charges?: DemoBookingCharge[];
  revision?: { beforePickup: number; beforeReturn: number };
};
type DemoBookingCharge = {
  type: 'DAMAGE' | 'EXTRA_RENTAL';
  status: 'PENDING' | 'CONFIRMED';
  amount: string;
};
const BOOKING_FIXTURES: DemoBookingFixture[] = [
  {
    status: BookingStatus.PENDING,
    customer: 0,
    offer: '40000000-0000-4000-8000-000000000001',
    car: null,
    pickup: 2,
    ret: 3,
    created: -1,
    option: DEMO_OPTIONS[0],
    revision: { beforePickup: 1, beforeReturn: 2 },
  },
  {
    status: BookingStatus.APPROVED,
    customer: 0,
    offer: '40000000-0000-4000-8000-000000000001',
    car: null,
    pickup: 0.04,
    ret: 1.04,
    created: -2,
    option: DEMO_OPTIONS[0],
  },
  {
    status: BookingStatus.IN_USE,
    customer: 0,
    offer: '40000000-0000-4000-8000-000000000001',
    car: '50000000-0000-4000-8000-000000000001',
    pickup: -1,
    ret: 1,
    created: -2,
    option: null,
  },
  {
    status: BookingStatus.COMPLETED,
    customer: 0,
    offer: '40000000-0000-4000-8000-000000000001',
    car: '50000000-0000-4000-8000-000000000001',
    pickup: -10,
    ret: -8,
    actual: -8 + 2 / 24,
    created: -15,
    option: DEMO_OPTIONS[0],
    charges: [
      { type: 'EXTRA_RENTAL', status: 'CONFIRMED', amount: '180.00' },
      { type: 'DAMAGE', status: 'CONFIRMED', amount: '250.00' },
    ],
  },
  {
    status: BookingStatus.PENDING,
    customer: 2,
    offer: '40000000-0000-4000-8000-000000000002',
    car: null,
    pickup: 3,
    ret: 4,
    created: -1,
    option: DEMO_OPTIONS[1],
  },
  {
    status: BookingStatus.CANCELLED,
    customer: 2,
    offer: '40000000-0000-4000-8000-000000000002',
    car: null,
    pickup: -20,
    ret: -19,
    created: -25,
    option: null,
    reason: 'Customer cancelled before pickup',
  },
  {
    status: BookingStatus.REJECTED,
    customer: 3,
    offer: '40000000-0000-4000-8000-000000000002',
    car: null,
    pickup: -30,
    ret: -29,
    created: -40,
    option: null,
    reason: 'Capacity unavailable at the selected branch',
  },
  {
    status: BookingStatus.COMPLETED,
    customer: 3,
    offer: '40000000-0000-4000-8000-000000000002',
    car: '50000000-0000-4000-8000-000000000009',
    pickup: -50,
    ret: -48,
    actual: -48 + 2 / 24,
    created: -60,
    option: DEMO_OPTIONS[1],
  },
  {
    status: BookingStatus.IN_USE,
    customer: 2,
    offer: '40000000-0000-4000-8000-000000000002',
    car: '50000000-0000-4000-8000-000000000010',
    pickup: -2,
    ret: -1,
    actual: -1 / 24,
    created: -3,
    option: null,
    charges: [
      { type: 'EXTRA_RENTAL', status: 'CONFIRMED', amount: '79.00' },
      { type: 'DAMAGE', status: 'PENDING', amount: '180.00' },
    ],
  },
  {
    status: BookingStatus.APPROVED,
    customer: 3,
    offer: '40000000-0000-4000-8000-000000000001',
    car: null,
    pickup: 4,
    ret: 5,
    created: -2,
    option: null,
  },
];
const day = 86_400_000;
const at = (offset: number) =>
  new Date(Date.now() + offset * day).toISOString();

const expectedStatuses = [
  BookingStatus.PENDING,
  BookingStatus.APPROVED,
  BookingStatus.IN_USE,
  BookingStatus.COMPLETED,
  BookingStatus.CANCELLED,
  BookingStatus.REJECTED,
];
if (
  expectedStatuses.some(
    (status) => !BOOKING_FIXTURES.some((fixture) => fixture.status === status),
  ) ||
  CAR_TYPE_IDS.some(
    (carTypeId) =>
      DEMO_IMAGES.filter((image) => image.carTypeId === carTypeId).length < 2,
  )
)
  throw new Error(
    'Demo fixtures must cover every booking status and two images per car type',
  );

async function seedDemo() {
  const url = process.env.DEMO_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url)
    throw new Error(
      'DATABASE_URL or DEMO_DATABASE_URL must target the local car-rental database',
    );
  const databaseUrl = new URL(url);
  if (
    databaseUrl.pathname !== '/car-rental' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(databaseUrl.hostname)
  )
    throw new Error(
      'DATABASE_URL or DEMO_DATABASE_URL must target the local car-rental database',
    );
  process.env.DATABASE_URL = url;
  const db = createAppDataSource();
  await db.initialize();
  try {
    await seedMain(db);
    const storage = new StorageService();
    const imageFiles = await Promise.all(
      DEMO_IMAGES.map(async (image) => ({
        ...image,
        bytes: await readFile(
          join(__dirname, '../assets/demo-cars', image.filename),
        ),
      })),
    );
    for (const image of imageFiles)
      await storage.put(
        `public/demo/${image.id}.jpg`,
        image.bytes,
        'image/jpeg',
      );

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
          .from('booking_revision')
          .where('booking_id IN (:...oldBookingIds)', { oldBookingIds })
          .execute();
      if (oldBookingIds.length)
        await manager
          .createQueryBuilder()
          .delete()
          .from('booking_option')
          .where('booking_id IN (:...oldBookingIds)', { oldBookingIds })
          .execute();
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
        .from('car_option')
        .where('id IN (:...optionIds)', {
          optionIds: DEMO_OPTIONS.map((option) => option.id),
        })
        .execute();
      const passwords = new PasswordService();
      for (const user of DEMO_USERS)
        await manager.query(
          `INSERT INTO app_user (id, email, password_hash, name, phone, role, is_suspended)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email,
             password_hash=EXCLUDED.password_hash, name=EXCLUDED.name,
             phone=EXCLUDED.phone, role=EXCLUDED.role,
             is_suspended=EXCLUDED.is_suspended, updated_at=now()`,
          [
            user.id,
            user.email,
            await passwords.hash('FunchDemo2026!'),
            user.name,
            user.phone,
            user.role,
            user.isSuspended,
          ],
        );
      for (const option of DEMO_OPTIONS)
        await manager.query(
          `INSERT INTO car_option (id, branch_id, code, name, description, category, pricing_type, price, quantity_stock)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            option.id,
            option.branch,
            option.code,
            'Demo child seat',
            'One unit available for the demo',
            'EQUIPMENT',
            'PER_UNIT_PER_DAY',
            option.price,
            option.stock,
          ],
        );

      for (const image of imageFiles) {
        const key = `public/demo/${image.id}.jpg`;
        await manager.query(
          `INSERT INTO file_asset (id, object_key, original_name, mime_type, size_bytes, visibility, uploaded_by)
           VALUES ($1,$2,$3,'image/jpeg',$4,'PUBLIC',$5)
           ON CONFLICT (id) DO UPDATE SET object_key=EXCLUDED.object_key,
             original_name=EXCLUDED.original_name, mime_type=EXCLUDED.mime_type,
             size_bytes=EXCLUDED.size_bytes, visibility=EXCLUDED.visibility,
             uploaded_by=EXCLUDED.uploaded_by, updated_at=now()`,
          [image.id, key, image.filename, image.bytes.length, ADMIN_ID],
        );
      }
      for (const carTypeId of CAR_TYPE_IDS) {
        await manager.query(
          'UPDATE car_type SET image_file_ids = $2::uuid[] WHERE id = $1',
          [
            carTypeId,
            imageFiles
              .filter((image) => image.carTypeId === carTypeId)
              .map((image) => image.id),
          ],
        );
      }

      for (let index = 0; index < BOOKING_FIXTURES.length; index++) {
        const fixture = BOOKING_FIXTURES[index];
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
          pickupAt: at(fixture.pickup),
          returnAt: at(fixture.ret),
          branchTimeZone: offer.timezone,
          hourlyRate: { amount: offer.hourly, currency: offer.currency },
          dailyRate: { amount: offer.daily, currency: offer.currency },
        });
        const line = fixture.option
          ? calculateOptionPrice({
              pickupAt: at(fixture.pickup),
              returnAt: at(fixture.ret),
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
        const id = `80000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
        const pickupAt = at(fixture.pickup);
        const returnAt = at(fixture.ret);
        const actualReturnAt =
          fixture.actual == null ? null : at(fixture.actual);
        await manager.query(
          `INSERT INTO booking (
            id, booking_number, checkout_key, user_id, car_type_branch_id, car_id,
            pickup_branch_id, return_branch_id, pickup_at, return_at,
            actual_return_at, ready_at, ready_by, status, currency_code,
            daily_rate_at_booking, hourly_rate_at_booking, charged_days,
            charged_hours, rental_subtotal, options_subtotal, total_amount,
            paid_amount,
            approved_by, approved_at, rejection_reason, cancellation_reason,
            created_at, updated_at
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
            $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29
          )`,
          [
            id,
            `DEMO-${String(index + 1).padStart(3, '0')}`,
            randomUUID(),
            DEMO_USERS[fixture.customer].id,
            fixture.offer,
            fixture.car,
            offer.branch,
            offer.branch,
            pickupAt,
            returnAt,
            actualReturnAt,
            fixture.status === BookingStatus.COMPLETED && fixture.actual != null
              ? at(fixture.actual + 1 / 24)
              : null,
            fixture.status === BookingStatus.COMPLETED ? ADMIN_ID : null,
            fixture.status,
            offer.currency,
            offer.daily,
            offer.hourly,
            rental.chargedDays,
            rental.chargedHours,
            total.rentalSubtotal.amount,
            total.optionsSubtotal.amount,
            total.totalAmount.amount,
            total.totalAmount.amount,
            [
              BookingStatus.APPROVED,
              BookingStatus.IN_USE,
              BookingStatus.COMPLETED,
            ].includes(fixture.status)
              ? ADMIN_ID
              : null,
            [
              BookingStatus.APPROVED,
              BookingStatus.IN_USE,
              BookingStatus.COMPLETED,
            ].includes(fixture.status)
              ? at(fixture.created + 0.01)
              : null,
            fixture.status === BookingStatus.REJECTED
              ? (fixture.reason ?? null)
              : null,
            fixture.status === BookingStatus.CANCELLED
              ? (fixture.reason ?? null)
              : null,
            at(fixture.created),
            at(fixture.created),
          ],
        );
        if (fixture.option && line)
          await manager.query(
            `INSERT INTO booking_option (id, booking_id, car_option_id, quantity, unit_price_at_booking, charged_units, total_amount)
             VALUES ($1,$2,$3,1,$4,$5,$6)`,
            [
              randomUUID(),
              id,
              fixture.option.id,
              fixture.option.price,
              line.chargedUnits,
              line.totalAmount.amount,
            ],
          );
        if (fixture.revision) {
          const options =
            fixture.option && line
              ? [
                  {
                    carOptionId: fixture.option.id,
                    name: 'Demo child seat',
                    quantity: 1,
                    unitPriceAtBooking: fixture.option.price,
                    chargedUnits: line.chargedUnits,
                    totalAmount: line.totalAmount.amount,
                  },
                ]
              : [];
          const afterState = {
            status: fixture.status,
            pickupAt,
            returnAt,
            currencyCode: offer.currency,
            dailyRateAtBooking: offer.daily,
            hourlyRateAtBooking: offer.hourly,
            chargedDays: rental.chargedDays,
            chargedHours: rental.chargedHours,
            rentalSubtotal: total.rentalSubtotal.amount,
            optionsSubtotal: total.optionsSubtotal.amount,
            totalAmount: total.totalAmount.amount,
            paidAmount: total.totalAmount.amount,
            approvedBy: null,
            approvedAt: null,
            options,
          };
          const beforeState = {
            ...afterState,
            status: BookingStatus.APPROVED,
            pickupAt: at(fixture.revision.beforePickup),
            returnAt: at(fixture.revision.beforeReturn),
            approvedBy: ADMIN_ID,
            approvedAt: at(fixture.created + 0.01),
          };
          await manager.query(
            `INSERT INTO booking_revision (
              id, booking_id, revision_number, changed_by, before_state,
              after_state, amount_delta, created_at
            ) VALUES ($1,$2,1,$3,$4::jsonb,$5::jsonb,0,$6)`,
            [
              '89000000-0000-4000-8000-000000000001',
              id,
              DEMO_USERS[fixture.customer].id,
              JSON.stringify(beforeState),
              JSON.stringify(afterState),
              at(fixture.created + 0.02),
            ],
          );
        }
        for (const charge of fixture.charges ?? [])
          await manager.query(
            `INSERT INTO additional_charge (id, booking_id, type, description, quantity, unit_price, amount, status, created_by)
             VALUES ($1,$2,$3,$4,1,$5,$5,$6,$7)`,
            [
              randomUUID(),
              id,
              charge.type,
              charge.type === 'EXTRA_RENTAL'
                ? 'Demo late-return rental charge'
                : charge.status === 'PENDING'
                  ? 'Demo damage charge awaiting review'
                  : 'Demo confirmed damage charge',
              charge.amount,
              charge.status,
              ADMIN_ID,
            ],
          );
      }
    });
    process.stdout.write(
      'Demo seed ready: 3 customers (one suspended), 10 bookings across all statuses, return review, charges, and 2 gallery images per car type. Password: FunchDemo2026!\n',
    );
  } finally {
    await db.destroy();
  }
}

void seedDemo().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
