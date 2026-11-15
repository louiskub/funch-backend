import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import {
  calculateAvailableQuantity,
  calculateBookingTotal,
  calculateLateReturnCharges,
  calculateOptionPrice,
  calculateReadyAt,
  calculateRentalPrice,
  canAssignCar,
  canCancelBooking,
  summarizeBookings,
} from '../../core';
import { addDecimals } from '../../core/decimal.core';
import { parseIsoInstant } from '../../core/time.core';
import type { AuthUser } from '../auth/types/auth.types';
import { UserRole } from '../auth/enums/user-role.enum';
import type {
  CheckoutInput,
  QuoteInput,
  AddChargeInput,
  ReportFilterInput,
} from './dto/booking.dto';
import { PasswordService } from '../auth/services/password.service';

type PriceRow = {
  id: string;
  pricingType: 'FIXED' | 'PER_DAY' | 'PER_UNIT_PER_DAY';
  quantityStock: number | null;
  price: string;
  currency: string;
};
type QuoteResult = {
  offerId: string;
  branchId: string;
  pickupAt: string;
  returnAt: string;
  currencyCode: string;
  chargedDays: number;
  chargedHours: number;
  rentalSubtotal: string;
  optionsSubtotal: string;
  totalAmount: string;
  dailyRateAtBooking: string;
  hourlyRateAtBooking: string;
  availableVehicles: number;
  options: Array<{
    carOptionId: string;
    quantity: number;
    unitPrice: string;
    chargedUnits: number;
    totalAmount: string;
    availableQuantity: number | null;
  }>;
};
const instant = (value: string) => {
  try {
    return parseIsoInstant(value)
      .toUTC()
      .toISO({ suppressMilliseconds: true })!;
  } catch {
    throw new BadRequestException(
      'Pickup and return must be valid ISO instants with timezone offsets',
    );
  }
};

@Injectable()
export class BookingsService {
  constructor(
    private readonly db: DataSource,
    private readonly passwords: PasswordService,
  ) {}

  async quote(
    input: QuoteInput,
    manager: EntityManager = this.db.manager,
  ): Promise<QuoteResult> {
    const pickupAt = instant(input.pickupAt);
    const returnAt = instant(input.returnAt);
    if (Date.parse(returnAt) <= Date.parse(pickupAt))
      throw new BadRequestException('Return must be after pickup');
    const offer = await manager
      .createQueryBuilder()
      .select([
        'o.id AS id',
        'o.branch_id AS "branchId"',
        'o.base_hourly_rate::text AS hourly',
        'o.base_daily_rate::text AS daily',
        'o.currency_code AS currency',
        'b.timezone AS timezone',
      ])
      .from('car_type_branch', 'o')
      .innerJoin('branch', 'b', 'b.id = o.branch_id')
      .innerJoin('car_type', 't', 't.id = o.car_type_id')
      .where(
        'o.id = :offerId AND o.is_active AND b.is_active AND t.is_active',
        {
          offerId: input.offerId,
        },
      )
      .getRawOne<Record<string, any>>();
    if (!offer) throw new NotFoundException('Car offer not found');
    const rental = calculateRentalPrice({
      pickupAt,
      returnAt,
      branchTimeZone: offer.timezone,
      hourlyRate: { amount: offer.hourly, currency: offer.currency },
      dailyRate: { amount: offer.daily, currency: offer.currency },
    });
    const selected = input.options ?? [];
    if (new Set(selected.map((x) => x.carOptionId)).size !== selected.length)
      throw new BadRequestException('Each option may be selected once');
    const lines: QuoteResult['options'] = [];
    for (const item of selected) {
      const option = await manager
        .createQueryBuilder()
        .select([
          'co.id AS id',
          'co.pricing_type AS "pricingType"',
          'co.quantity_stock AS "quantityStock"',
          'co.price::text AS price',
          ':currency AS currency',
        ])
        .from('car_option', 'co')
        .where(
          'co.id = :optionId AND co.branch_id = :branchId AND co.is_active',
          {
            optionId: item.carOptionId,
            branchId: offer.branchId,
            currency: offer.currency,
          },
        )
        .getRawOne<PriceRow>();
      if (!option)
        throw new BadRequestException(
          'An option is unavailable at this branch',
        );
      if (option.quantityStock !== null && item.quantity > option.quantityStock)
        throw new BadRequestException(
          `${item.carOptionId} exceeds available stock`,
        );
      let availableQuantity: number | null = null;
      if (option.quantityStock !== null) {
        const reservations = await manager
          .createQueryBuilder()
          .select([
            'bo.quantity AS quantity',
            'b.pickup_at AS "pickupAt"',
            'COALESCE(b.actual_return_at, b.return_at) AS "returnAt"',
          ])
          .from('booking_option', 'bo')
          .innerJoin('booking', 'b', 'b.id = bo.booking_id')
          .where(
            "bo.car_option_id = :optionId AND b.status IN ('APPROVED','IN_USE')",
            {
              optionId: item.carOptionId,
            },
          )
          .getRawMany<Record<string, any>>();
        availableQuantity = calculateAvailableQuantity({
          requestedInterval: { startsAt: pickupAt, endsAt: returnAt },
          capacity: option.quantityStock,
          reservedIntervals: reservations.map((row) => ({
            startsAt: new Date(String(row.pickupAt)).toISOString(),
            endsAt: new Date(String(row.returnAt)).toISOString(),
            quantity: Number(row.quantity),
          })),
        }).availableQuantity;
      }
      const price = calculateOptionPrice({
        pickupAt,
        returnAt,
        pricingType: option.pricingType,
        unitPrice: { amount: option.price, currency: offer.currency },
        quantity: item.quantity,
      });
      lines.push({
        carOptionId: item.carOptionId,
        quantity: item.quantity,
        unitPrice: option.price,
        chargedUnits: price.chargedUnits,
        totalAmount: price.totalAmount.amount,
        availableQuantity,
      });
    }
    const total = calculateBookingTotal({
      rentalPrice: rental.rentalSubtotal,
      optionPrices: lines.map((x) => ({
        amount: x.totalAmount,
        currency: offer.currency,
      })),
    });
    const capacity = await manager
      .createQueryBuilder()
      .select('count(*)::int', 'count')
      .from('car', 'c')
      .where(
        "c.car_type_branch_id = :offerId AND c.status = 'ACTIVE' AND c.is_active",
        {
          offerId: offer.id,
        },
      )
      .getRawOne<{ count: number }>();
    const vehicleCapacity = Number(capacity.count);
    const vehicleAvailability = calculateAvailableQuantity({
      requestedInterval: {
        startsAt: pickupAt,
        endsAt: calculateReadyAt({ returnAt, actualReturnAt: null }).readyAt,
      },
      capacity: vehicleCapacity,
      reservedIntervals: await this.reserved(manager, String(offer.id)),
    });
    return {
      offerId: offer.id,
      branchId: offer.branchId,
      pickupAt,
      returnAt,
      currencyCode: offer.currency,
      chargedDays: rental.chargedDays,
      chargedHours: rental.chargedHours,
      rentalSubtotal: total.rentalSubtotal.amount,
      optionsSubtotal: total.optionsSubtotal.amount,
      totalAmount: total.totalAmount.amount,
      dailyRateAtBooking: offer.daily,
      hourlyRateAtBooking: offer.hourly,
      availableVehicles: vehicleAvailability.availableQuantity,
      options: lines,
    };
  }

  async checkout(input: CheckoutInput, actor?: AuthUser) {
    if (actor && actor.role !== UserRole.CUSTOMER)
      throw new ForbiddenException('Only customers can create bookings');
    const token =
      !actor && input.customerEmail
        ? randomBytes(32).toString('base64url')
        : null;
    const result = await this.db.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .select('pg_advisory_xact_lock(hashtext(:key))')
        .setParameter('key', input.checkoutKey)
        .getRawOne();
      const existing = await manager
        .createQueryBuilder()
        .select([
          'b.id AS id',
          'b.booking_number AS "bookingNumber"',
          'b.status AS status',
          'b.total_amount::text AS "totalAmount"',
          'b.currency_code AS "currencyCode"',
          'b.user_id AS "userId"',
        ])
        .from('booking', 'b')
        .where('b.checkout_key = :checkoutKey', {
          checkoutKey: input.checkoutKey,
        })
        .getRawOne<Record<string, string>>();
      if (existing) {
        if (actor && existing.userId !== actor.id)
          throw new ForbiddenException();
        if (!actor) {
          const owner = await manager
            .createQueryBuilder()
            .select([
              'u.email AS email',
              'u.password_hash AS "passwordHash"',
              'u.is_suspended AS "isSuspended"',
            ])
            .from('app_user', 'u')
            .where('u.id = :userId', { userId: existing.userId })
            .getRawOne<{
              email: string;
              passwordHash: string;
              isSuspended: boolean;
            }>();
          if (
            !owner ||
            owner.isSuspended ||
            owner.email !== input.customerEmail?.trim().toLowerCase() ||
            !input.customerPassword ||
            !(await this.passwords.verify(
              input.customerPassword,
              owner.passwordHash,
            ))
          )
            throw new UnauthorizedException('Invalid checkout credentials');
          await manager
            .createQueryBuilder()
            .insert()
            .into('user_session')
            .values({
              token_hash: createHash('sha256').update(token!).digest('hex'),
              user_id: existing.userId,
              expires_at: () => "now() + interval '14 days'",
            })
            .execute();
        }
        const { userId: _userId, ...booking } = existing;
        void _userId;
        return booking;
      }
      let customerId = actor?.id;
      if (!actor) {
        if (
          !input.customerName ||
          !input.customerEmail ||
          !input.customerPassword ||
          !input.customerPhone
        )
          throw new BadRequestException(
            'Sign in or provide all account fields to register and checkout',
          );
        const email = input.customerEmail.trim().toLowerCase();
        await manager
          .createQueryBuilder()
          .select('pg_advisory_xact_lock(hashtext(:key))')
          .setParameter('key', `account:${email}`)
          .getRawOne();
        const accountExists = await manager
          .createQueryBuilder()
          .select('u.id')
          .from('app_user', 'u')
          .where('u.email = :email', { email })
          .getExists();
        if (accountExists)
          throw new ConflictException(
            'An account with this email already exists',
          );
        const id = randomUUID();
        const userResult = await manager
          .createQueryBuilder()
          .insert()
          .into('app_user')
          .values({
            id,
            email,
            password_hash: await this.passwords.hash(input.customerPassword),
            name: input.customerName.trim(),
            phone: input.customerPhone.trim(),
            role: 'CUSTOMER',
          })
          .returning('id')
          .execute();
        customerId = userResult.raw[0]?.id;
        await manager
          .createQueryBuilder()
          .insert()
          .into('user_session')
          .values({
            token_hash: createHash('sha256').update(token!).digest('hex'),
            user_id: customerId,
            expires_at: () => "now() + interval '14 days'",
          })
          .execute();
      }
      const quote = await this.quote(input, manager);
      const bookingId = randomUUID();
      const bookingNumber = `F${Date.now().toString(36).toUpperCase()}${randomBytes(3).toString('hex').toUpperCase()}`;
      await manager
        .createQueryBuilder()
        .insert()
        .into('booking')
        .values({
          id: bookingId,
          booking_number: bookingNumber,
          checkout_key: input.checkoutKey,
          user_id: customerId,
          car_type_branch_id: quote.offerId,
          pickup_branch_id: quote.branchId,
          return_branch_id: quote.branchId,
          pickup_at: quote.pickupAt,
          return_at: quote.returnAt,
          status: 'PENDING',
          currency_code: quote.currencyCode,
          daily_rate_at_booking: quote.dailyRateAtBooking,
          hourly_rate_at_booking: quote.hourlyRateAtBooking,
          charged_days: quote.chargedDays,
          charged_hours: quote.chargedHours,
          rental_subtotal: quote.rentalSubtotal,
          options_subtotal: quote.optionsSubtotal,
          total_amount: quote.totalAmount,
        })
        .execute();
      for (const line of quote.options)
        await manager
          .createQueryBuilder()
          .insert()
          .into('booking_option')
          .values({
            id: randomUUID(),
            booking_id: bookingId,
            car_option_id: line.carOptionId,
            quantity: line.quantity,
            unit_price_at_booking: line.unitPrice,
            charged_units: line.chargedUnits,
            total_amount: line.totalAmount,
          })
          .execute();
      return {
        id: bookingId,
        bookingNumber,
        status: 'PENDING',
        totalAmount: quote.totalAmount,
        currencyCode: quote.currencyCode,
      };
    });
    return {
      ...result,
      ...(token ? { sessionToken: token } : {}),
    };
  }

  async mine(userId: string) {
    return this.db
      .createQueryBuilder()
      .select([
        'b.id AS id',
        'b.booking_number AS "bookingNumber"',
        'b.status AS status',
        'b.pickup_at AS "pickupAt"',
        'b.return_at AS "returnAt"',
        'b.total_amount::text AS "totalAmount"',
        'b.currency_code AS "currencyCode"',
        't.brand AS brand',
        't.model AS model',
        'br.name AS "branchName"',
      ])
      .from('booking', 'b')
      .innerJoin('car_type_branch', 'o', 'o.id = b.car_type_branch_id')
      .innerJoin('car_type', 't', 't.id = o.car_type_id')
      .innerJoin('branch', 'br', 'br.id = b.pickup_branch_id')
      .where('b.user_id = :userId', { userId })
      .orderBy('b.created_at', 'DESC')
      .getRawMany();
  }

  async get(id: string, actor: AuthUser) {
    const booking = await this.db
      .createQueryBuilder()
      .select([
        'b.*',
        'b.booking_number AS "bookingNumber"',
        'b.user_id AS "userId"',
        'b.car_type_branch_id AS "carTypeBranchId"',
        'b.car_id AS "carId"',
        'b.pickup_at AS "pickupAt"',
        'b.return_at AS "returnAt"',
        'b.actual_return_at AS "actualReturnAt"',
        'b.currency_code AS "currencyCode"',
        'b.daily_rate_at_booking::text AS "dailyRateAtBooking"',
        'b.hourly_rate_at_booking::text AS "hourlyRateAtBooking"',
        'b.charged_days AS "chargedDays"',
        'b.charged_hours AS "chargedHours"',
        'b.rental_subtotal::text AS "rentalSubtotal"',
        'b.options_subtotal::text AS "optionsSubtotal"',
        'b.total_amount::text AS "totalAmount"',
        'b.rejection_reason AS "rejectionReason"',
        'b.cancellation_reason AS "cancellationReason"',
        'b.created_at AS "createdAt"',
        't.brand AS brand',
        't.model AS model',
        'br.name AS "branchName"',
      ])
      .from('booking', 'b')
      .innerJoin('car_type_branch', 'o', 'o.id = b.car_type_branch_id')
      .innerJoin('car_type', 't', 't.id = o.car_type_id')
      .innerJoin('branch', 'br', 'br.id = b.pickup_branch_id')
      .where('b.id = :id', { id })
      .getRawOne<Record<string, any>>();
    if (!booking) throw new NotFoundException('Booking not found');
    if (actor.role !== UserRole.ADMIN && booking.userId !== actor.id)
      throw new ForbiddenException();
    booking.options = await this.db
      .createQueryBuilder()
      .select([
        'bo.id AS id',
        'bo.car_option_id AS "carOptionId"',
        'co.name AS name',
        'bo.quantity AS quantity',
        'bo.unit_price_at_booking::text AS "unitPriceAtBooking"',
        'bo.charged_units AS "chargedUnits"',
        'bo.total_amount::text AS "totalAmount"',
      ])
      .from('booking_option', 'bo')
      .innerJoin('car_option', 'co', 'co.id = bo.car_option_id')
      .where('bo.booking_id = :id', { id })
      .getRawMany();
    booking.charges = await this.db
      .createQueryBuilder()
      .select([
        'a.id AS id',
        'a.type AS type',
        'a.description AS description',
        'a.booking_option_id AS "bookingOptionId"',
        'a.quantity AS quantity',
        'a.unit_price::text AS "unitPrice"',
        'a.amount::text AS amount',
        'a.status AS status',
        'a.created_at AS "createdAt"',
      ])
      .from('additional_charge', 'a')
      .where('a.booking_id = :id', { id })
      .orderBy('a.created_at')
      .getRawMany();
    booking.finalAmount = await this.finalAmount(this.db.manager, id);
    return booking;
  }

  async cancel(id: string, actor: AuthUser, reason?: string) {
    return this.db.transaction(async (manager) => {
      const b = await manager
        .createQueryBuilder()
        .select([
          'b.id AS id',
          'b.user_id AS "userId"',
          'b.status AS status',
          'b.pickup_at AS "pickupAt"',
        ])
        .from('booking', 'b')
        .where('b.id = :id', { id })
        .setLock('pessimistic_write')
        .getRawOne<Record<string, any>>();
      if (!b) throw new NotFoundException('Booking not found');
      const decision = canCancelBooking({
        actor: { role: actor.role, userId: actor.id },
        booking: {
          customerId: b.userId,
          status: b.status,
          pickupAt: new Date(String(b.pickupAt)).toISOString(),
        },
        now: new Date().toISOString(),
        cancellationReason: reason ?? null,
      });
      if (!decision.allowed) throw new ConflictException(decision.reason);
      await manager
        .createQueryBuilder()
        .update('booking')
        .set({
          status: 'CANCELLED',
          cancellation_reason:
            actor.role === UserRole.ADMIN ? reason!.trim() : null,
          updated_at: () => 'now()',
        })
        .where('id = :id', { id })
        .execute();
      return { id, status: 'CANCELLED' };
    });
  }

  private async reserved(
    manager: EntityManager,
    ctbId: string,
    excludeId?: string,
  ) {
    const query = manager
      .createQueryBuilder()
      .select([
        'b.id AS id',
        'b.pickup_at AS "pickupAt"',
        'b.return_at AS "returnAt"',
        'b.actual_return_at AS "actualReturnAt"',
        'b.status AS status',
      ])
      .from('booking', 'b')
      .where(
        "b.car_type_branch_id = :ctbId AND b.status IN ('APPROVED','IN_USE','COMPLETED')",
        { ctbId },
      );
    if (excludeId) query.andWhere('b.id <> :excludeId', { excludeId });
    const rows = await query.getRawMany<Record<string, any>>();
    return rows.map((b) => ({
      startsAt: new Date(String(b.pickupAt)).toISOString(),
      endsAt: calculateReadyAt({
        returnAt: new Date(String(b.returnAt)).toISOString(),
        actualReturnAt: b.actualReturnAt
          ? new Date(String(b.actualReturnAt)).toISOString()
          : null,
      }).readyAt,
      quantity: 1,
    }));
  }

  private async capacityConflicts(manager: EntityManager, ctbId: string) {
    const count = await manager
      .createQueryBuilder()
      .select('count(*)::int', 'count')
      .from('car', 'c')
      .where(
        "c.car_type_branch_id = :ctbId AND c.status = 'ACTIVE' AND c.is_active",
        { ctbId },
      )
      .getRawOne<{ count: number }>();
    const capacity = Number(count.count);
    const rows = await manager
      .createQueryBuilder()
      .select([
        'b.id AS id',
        'b.pickup_at AS "pickupAt"',
        'b.return_at AS "returnAt"',
        'b.actual_return_at AS "actualReturnAt"',
      ])
      .from('booking', 'b')
      .where(
        "b.car_type_branch_id = :ctbId AND b.status IN ('APPROVED','IN_USE','COMPLETED')",
        { ctbId },
      )
      .orderBy('b.pickup_at')
      .getRawMany<Record<string, any>>();
    const intervals = rows.map((row) => ({
      id: String(row.id),
      startsAt: new Date(String(row.pickupAt)).toISOString(),
      endsAt: calculateReadyAt({
        returnAt: new Date(String(row.returnAt)).toISOString(),
        actualReturnAt: row.actualReturnAt
          ? new Date(String(row.actualReturnAt)).toISOString()
          : null,
      }).readyAt,
    }));
    return intervals
      .filter(
        (interval) =>
          calculateAvailableQuantity({
            requestedInterval: interval,
            capacity,
            reservedIntervals: intervals
              .filter((other) => other.id !== interval.id)
              .map((other) => ({ ...other, quantity: 1 })),
          }).availableQuantity < 1,
      )
      .map(({ id }) => id);
  }

  async queue(status?: string) {
    const builder = this.db
      .createQueryBuilder()
      .select([
        'b.id AS id',
        'b.booking_number AS "bookingNumber"',
        'b.status AS status',
        'b.pickup_at AS "pickupAt"',
        'b.return_at AS "returnAt"',
        'b.actual_return_at AS "actualReturnAt"',
        'b.total_amount::text AS "totalAmount"',
        'b.currency_code AS "currencyCode"',
        'u.name AS "customerName"',
        'u.email AS "customerEmail"',
        't.brand AS brand',
        't.model AS model',
        'br.name AS "branchName"',
      ])
      .from('booking', 'b')
      .innerJoin('app_user', 'u', 'u.id = b.user_id')
      .innerJoin('car_type_branch', 'o', 'o.id = b.car_type_branch_id')
      .innerJoin('car_type', 't', 't.id = o.car_type_id')
      .innerJoin('branch', 'br', 'br.id = b.pickup_branch_id')
      .orderBy('b.created_at');
    if (status !== undefined) builder.where('b.status = :status', { status });
    const bookings = await builder.getRawMany<Record<string, any>>();
    if (!bookings.length) return bookings;
    const charges = await this.db
      .createQueryBuilder()
      .select([
        'a.booking_id AS "bookingId"',
        'a.id AS id',
        'a.type AS type',
        'a.description AS description',
        'a.amount::text AS amount',
        'a.status AS status',
        'a.created_at AS "createdAt"',
      ])
      .from('additional_charge', 'a')
      .where('a.booking_id IN (:...bookingIds)', {
        bookingIds: bookings.map(({ id }) => id),
      })
      .orderBy('a.created_at')
      .getRawMany<Record<string, any>>();
    const byBooking = new Map<string, Record<string, unknown>[]>();
    for (const { bookingId, createdAt: _createdAt, ...charge } of charges) {
      void _createdAt;
      const list = byBooking.get(bookingId) ?? [];
      list.push(charge);
      byBooking.set(bookingId, list);
    }
    return bookings.map((booking) => {
      const bookingCharges = byBooking.get(booking.id) ?? [];
      const confirmed = charges
        .filter(
          (charge) =>
            charge.bookingId === booking.id && charge.status === 'CONFIRMED',
        )
        .reduce((sum, charge) => addDecimals(sum, charge.amount), '0');
      return {
        ...booking,
        finalAmount: addDecimals(booking.totalAmount, confirmed),
        charges: bookingCharges,
      };
    });
  }

  async approve(id: string, actor: AuthUser) {
    return this.db.transaction(async (manager) => {
      const row = await manager
        .createQueryBuilder()
        .select('b.*')
        .from('booking', 'b')
        .where('b.id = :id', { id })
        .setLock('pessimistic_write')
        .getRawOne<Record<string, any>>();
      if (!row) throw new NotFoundException('Booking not found');
      if (row.status !== 'PENDING')
        throw new ConflictException('Only pending bookings can be approved');
      await manager
        .createQueryBuilder()
        .select('o.id')
        .from('car_type_branch', 'o')
        .where('o.id = :id', { id: row.car_type_branch_id })
        .setLock('pessimistic_write')
        .getRawOne();
      const carCount = await manager
        .createQueryBuilder()
        .select('count(*)::int', 'count')
        .from('car', 'c')
        .where(
          "c.car_type_branch_id = :id AND c.status = 'ACTIVE' AND c.is_active",
          {
            id: row.car_type_branch_id,
          },
        )
        .getRawOne<{ count: number }>();
      const cars = carCount.count;
      const interval = {
        startsAt: new Date(String(row.pickup_at)).toISOString(),
        endsAt: calculateReadyAt({
          returnAt: new Date(String(row.return_at)).toISOString(),
          actualReturnAt: null,
        }).readyAt,
      };
      const capacity = calculateAvailableQuantity({
        requestedInterval: interval,
        capacity: cars,
        reservedIntervals: await this.reserved(
          manager,
          String(row.car_type_branch_id),
          id,
        ),
      });
      if (capacity.availableQuantity < 1)
        throw new ConflictException(
          'Vehicle capacity is unavailable; reject this request with a reason',
        );
      const options = await manager
        .createQueryBuilder()
        .select([
          'bo.car_option_id AS id',
          'bo.quantity AS quantity',
          'co.quantity_stock AS stock',
        ])
        .from('booking_option', 'bo')
        .innerJoin('car_option', 'co', 'co.id = bo.car_option_id')
        .where('bo.booking_id = :id AND co.quantity_stock IS NOT NULL', { id })
        .orderBy('bo.car_option_id')
        .getRawMany<Record<string, any>>();
      for (const option of options) {
        await manager
          .createQueryBuilder()
          .select('co.id')
          .from('car_option', 'co')
          .where('co.id = :optionId', { optionId: option.id })
          .setLock('pessimistic_write')
          .getRawOne();
        const reservations = await manager
          .createQueryBuilder()
          .select([
            'bo.quantity AS quantity',
            'b.pickup_at AS "pickupAt"',
            'COALESCE(b.actual_return_at, b.return_at) AS "returnAt"',
          ])
          .from('booking_option', 'bo')
          .innerJoin('booking', 'b', 'b.id = bo.booking_id')
          .where(
            "bo.car_option_id = :optionId AND b.status IN ('APPROVED','IN_USE') AND b.id <> :id",
            {
              optionId: option.id,
              id,
            },
          )
          .getRawMany<Record<string, any>>();
        const available = calculateAvailableQuantity({
          requestedInterval: interval,
          capacity: option.stock,
          reservedIntervals: reservations.map((x) => ({
            startsAt: new Date(String(x.pickupAt)).toISOString(),
            endsAt: new Date(String(x.returnAt)).toISOString(),
            quantity: x.quantity,
          })),
        });
        if (available.availableQuantity < option.quantity)
          throw new ConflictException(
            `Option ${option.id} has insufficient stock`,
          );
      }
      await manager
        .createQueryBuilder()
        .update('booking')
        .set({
          status: 'APPROVED',
          approved_by: actor.id,
          approved_at: () => 'now()',
          updated_at: () => 'now()',
        })
        .where('id = :id', { id })
        .execute();
      return { id, status: 'APPROVED' };
    });
  }

  async reject(id: string, reason: string) {
    if (!reason.trim())
      throw new BadRequestException('A rejection reason is required');
    const result = await this.db
      .createQueryBuilder()
      .update('booking')
      .set({
        status: 'REJECTED',
        rejection_reason: reason.trim(),
        updated_at: () => 'now()',
      })
      .where("id = :id AND status = 'PENDING'", { id })
      .returning('id')
      .execute();
    if (!result.raw[0])
      throw new ConflictException('Only pending bookings can be rejected');
    return { id, status: 'REJECTED' };
  }

  async pickup(id: string, carId: string) {
    return this.db.transaction(async (manager) => {
      const booking = await manager
        .createQueryBuilder()
        .select('b.*')
        .from('booking', 'b')
        .where('b.id = :id', { id })
        .setLock('pessimistic_write')
        .getRawOne<Record<string, any>>();
      if (!booking) throw new NotFoundException('Booking not found');
      const car = await manager
        .createQueryBuilder()
        .select([
          'c.id AS id',
          'c.car_type_branch_id AS "carTypeBranchId"',
          'c.status AS status',
          'c.is_active AS is_active',
        ])
        .from('car', 'c')
        .where('c.id = :carId', { carId })
        .setLock('pessimistic_write')
        .getRawOne<Record<string, any>>();
      if (!car) throw new NotFoundException('Car not found');
      const current = new Date();
      const active = await manager
        .createQueryBuilder()
        .select('b.id')
        .from('booking', 'b')
        .where(
          "b.car_id = :carId AND b.status = 'IN_USE' AND b.actual_return_at IS NULL AND b.id <> :id",
          {
            carId,
            id,
          },
        )
        .getExists();
      const decision = canAssignCar({
        booking: {
          status: booking.status,
          pickupAt: new Date(String(booking.pickup_at)).toISOString(),
          carTypeBranchId: booking.car_type_branch_id,
        },
        car: {
          carTypeBranchId: car.carTypeBranchId,
          isOperational: car.status === 'ACTIVE' && car.is_active,
          isOutOnRent: active,
          readyAt: await this.carReadyAt(manager, carId),
        },
        now: current.toISOString(),
      });
      if (!decision.allowed) throw new ConflictException(decision.reason);
      await manager
        .createQueryBuilder()
        .update('booking')
        .set({ status: 'IN_USE', car_id: carId, updated_at: () => 'now()' })
        .where('id = :id', { id })
        .execute();
      return { id, status: 'IN_USE', carId };
    });
  }

  async pickupCars(id: string) {
    const booking = await this.db
      .createQueryBuilder()
      .select('b.car_type_branch_id', 'carTypeBranchId')
      .from('booking', 'b')
      .where("b.id = :id AND b.status = 'APPROVED'", { id })
      .getRawOne<{ carTypeBranchId: string }>();
    if (!booking)
      throw new ConflictException('Booking is not ready for pickup');
    return this.db
      .createQueryBuilder()
      .select([
        'c.id AS id',
        'c.license_plate AS "licensePlate"',
        'c.status AS status',
        `EXISTS(SELECT 1 FROM booking active WHERE active.car_id = c.id AND active.status = 'IN_USE' AND active.actual_return_at IS NULL) AS "isOutOnRent"`,
        `COALESCE((SELECT CASE WHEN previous.actual_return_at IS NULL THEN previous.return_at + interval '2 hours' ELSE previous.actual_return_at + interval '1 hour' END FROM booking previous WHERE previous.car_id = c.id AND previous.status IN ('IN_USE','COMPLETED') ORDER BY COALESCE(previous.actual_return_at, previous.return_at) DESC LIMIT 1), '-infinity'::timestamptz) AS "readyAt"`,
      ])
      .from('car', 'c')
      .where('c.car_type_branch_id = :carTypeBranchId AND c.is_active', {
        carTypeBranchId: booking.carTypeBranchId,
      })
      .orderBy('c.license_plate')
      .getRawMany();
  }

  private async carReadyAt(manager: EntityManager, carId: string) {
    const row = await manager
      .createQueryBuilder()
      .select([
        'b.return_at AS "returnAt"',
        'b.actual_return_at AS "actualReturnAt"',
      ])
      .from('booking', 'b')
      .where("b.car_id = :carId AND b.status IN ('IN_USE','COMPLETED')", {
        carId,
      })
      .orderBy('COALESCE(b.actual_return_at, b.return_at)', 'DESC')
      .limit(1)
      .getRawOne<Record<string, any>>();
    return row
      ? calculateReadyAt({
          returnAt: new Date(String(row.returnAt)).toISOString(),
          actualReturnAt: row.actualReturnAt
            ? new Date(String(row.actualReturnAt)).toISOString()
            : null,
        }).readyAt
      : '1970-01-01T00:00:00Z';
  }

  async returnPreview(id: string) {
    const row = await this.db
      .createQueryBuilder()
      .select([
        'b.*',
        'b.car_type_branch_id AS "carTypeBranchId"',
        'b.pickup_at AS "pickupAt"',
        'b.return_at AS "returnAt"',
        'b.daily_rate_at_booking::text AS daily',
        'b.hourly_rate_at_booking::text AS hourly',
        'b.rental_subtotal::text AS rental',
        'b.currency_code AS currency',
        'br.timezone AS timezone',
      ])
      .from('booking', 'b')
      .innerJoin('car_type_branch', 'o', 'o.id = b.car_type_branch_id')
      .innerJoin('branch', 'br', 'br.id = o.branch_id')
      .where('b.id = :id', { id })
      .getRawOne<Record<string, any>>();
    if (!row) throw new NotFoundException('Booking not found');
    if (row.status !== 'IN_USE')
      throw new ConflictException('Only in-use bookings can be returned');
    if (row.actual_return_at)
      throw new ConflictException('Return has already been recorded');
    const options = await this.db
      .createQueryBuilder()
      .select([
        'bo.id AS id',
        'bo.car_option_id AS "carOptionId"',
        'co.pricing_type AS "pricingType"',
        'bo.quantity AS quantity',
        'bo.unit_price_at_booking::text AS "unitPrice"',
        'bo.charged_units AS "chargedUnits"',
        'bo.total_amount::text AS "totalAmount"',
      ])
      .from('booking_option', 'bo')
      .innerJoin('car_option', 'co', 'co.id = bo.car_option_id')
      .where('bo.booking_id = :id', { id })
      .getRawMany<Record<string, any>>();
    const actualReturnAt = new Date().toISOString();
    const lines = calculateLateReturnCharges({
      pickupAt: new Date(String(row.pickupAt)).toISOString(),
      returnAt: new Date(String(row.returnAt)).toISOString(),
      actualReturnAt,
      branchTimeZone: row.timezone,
      hourlyRate: { amount: row.hourly, currency: row.currency },
      dailyRate: { amount: row.daily, currency: row.currency },
      rentalSubtotal: { amount: row.rental, currency: row.currency },
      options: options.map((o) => ({
        bookingOptionId: o.id,
        pricingType: o.pricingType,
        quantity: o.quantity,
        unitPrice: { amount: o.unitPrice, currency: row.currency },
        chargedUnits: o.chargedUnits,
        totalAmount: { amount: o.totalAmount, currency: row.currency },
      })),
    });
    const bookingAmount = String(row.total_amount);
    const currentFinalAmount = await this.finalAmount(this.db.manager, id);
    return {
      actualReturnAt,
      bookingAmount,
      projectedFinalAmount: lines.reduce(
        (amount, line) => addDecimals(amount, line.amount.amount),
        currentFinalAmount,
      ),
      lines,
    };
  }

  async completeReturn(id: string, actor: AuthUser, charges: AddChargeInput[]) {
    return this.db.transaction(async (manager) => {
      const b = await manager
        .createQueryBuilder()
        .select('b.*')
        .from('booking', 'b')
        .where('b.id = :id', { id })
        .setLock('pessimistic_write')
        .getRawOne<Record<string, any>>();
      if (!b) throw new NotFoundException('Booking not found');
      if (b.status !== 'IN_USE')
        throw new ConflictException('Only in-use bookings can be returned');
      await manager
        .createQueryBuilder()
        .select('o.id')
        .from('car_type_branch', 'o')
        .where('o.id = :id', { id: b.car_type_branch_id })
        .setLock('pessimistic_write')
        .getRawOne();
      if (b.actual_return_at) {
        const existing = await manager
          .createQueryBuilder()
          .select([
            'a.id AS id',
            'a.type AS type',
            'a.description AS description',
            'a.quantity AS quantity',
            'a.unit_price::text AS "unitPrice"',
            'a.amount::text AS amount',
            'a.status AS status',
          ])
          .from('additional_charge', 'a')
          .where(
            "a.booking_id = :id AND a.type IN ('EXTRA_RENTAL','EXTRA_OPTION')",
            { id },
          )
          .orderBy('a.created_at')
          .getRawMany();
        return {
          id,
          status: 'IN_USE',
          actualReturnAt: new Date(String(b.actual_return_at)).toISOString(),
          lines: existing,
          capacityConflictBookingIds: await this.capacityConflicts(
            manager,
            String(b.car_type_branch_id),
          ),
        };
      }
      const preview = await this.returnPreview(id);
      for (const line of preview.lines)
        await manager
          .createQueryBuilder()
          .insert()
          .into('additional_charge')
          .values({
            id: randomUUID(),
            booking_id: id,
            booking_option_id:
              line.kind === 'EXTRA_OPTION' ? line.bookingOptionId : null,
            type: line.kind,
            description:
              line.kind === 'EXTRA_RENTAL'
                ? 'Additional rental time'
                : 'Additional option rental',
            quantity: line.quantity,
            unit_price: line.unitPrice.amount,
            amount: line.amount.amount,
            status: 'CONFIRMED',
            created_by: actor.id,
          })
          .orIgnore()
          .execute();
      for (const charge of charges) {
        if (!['FUEL', 'DAMAGE', 'OTHER'].includes(charge.type))
          throw new BadRequestException('Unsupported additional charge type');
        if (!/^(0|[1-9]\d*)(\.\d{1,4})?$/.test(charge.amount))
          throw new BadRequestException(
            'Charge amount must be a non-negative decimal with at most four places',
          );
        await manager
          .createQueryBuilder()
          .insert()
          .into('additional_charge')
          .values({
            id: randomUUID(),
            booking_id: id,
            type: charge.type,
            description: charge.description.trim(),
            quantity: 1,
            unit_price: charge.amount,
            amount: charge.amount,
            status: 'PENDING',
            created_by: actor.id,
          })
          .execute();
      }
      await manager
        .createQueryBuilder()
        .update('booking')
        .set({
          actual_return_at: preview.actualReturnAt,
          updated_at: () => 'now()',
        })
        .where('id = :id', { id })
        .execute();
      return {
        id,
        status: 'IN_USE',
        ...preview,
        capacityConflictBookingIds: await this.capacityConflicts(
          manager,
          String(b.car_type_branch_id),
        ),
      };
    });
  }

  async confirmReturn(id: string) {
    return this.db.transaction(async (manager) => {
      const b = await manager
        .createQueryBuilder()
        .select([
          'b.id AS id',
          'b.status AS status',
          'b.actual_return_at AS actual_return_at',
        ])
        .from('booking', 'b')
        .where('b.id = :id', { id })
        .setLock('pessimistic_write')
        .getRawOne<Record<string, any>>();
      if (!b) throw new NotFoundException('Booking not found');
      if (b.status !== 'IN_USE')
        throw new ConflictException(
          'Booking is not awaiting return confirmation',
        );
      if (!b.actual_return_at)
        throw new ConflictException(
          'Record the actual return before completing the booking',
        );
      const pending = await manager
        .createQueryBuilder()
        .select('a.id')
        .from('additional_charge', 'a')
        .where("a.booking_id = :id AND a.status = 'PENDING'", { id })
        .getExists();
      if (pending)
        throw new ConflictException(
          'Confirm or waive pending charges before completing the booking',
        );
      await manager
        .createQueryBuilder()
        .update('booking')
        .set({ status: 'COMPLETED', updated_at: () => 'now()' })
        .where('id = :id', { id })
        .execute();
      return {
        id,
        status: 'COMPLETED',
        finalAmount: await this.finalAmount(manager, id),
      };
    });
  }

  private async finalAmount(manager: EntityManager, id: string) {
    const row = await manager
      .createQueryBuilder()
      .select([
        'b.total_amount::text AS total',
        "COALESCE(sum(a.amount) FILTER (WHERE a.status = 'CONFIRMED'), 0)::text AS extra",
      ])
      .from('booking', 'b')
      .leftJoin('additional_charge', 'a', 'a.booking_id = b.id')
      .where('b.id = :id', { id })
      .groupBy('b.id')
      .getRawOne<{ total: string; extra: string }>();
    return addDecimals(row.total, row.extra);
  }

  async addCharge(id: string, actor: AuthUser, input: AddChargeInput) {
    if (!['FUEL', 'DAMAGE', 'OTHER'].includes(input.type))
      throw new BadRequestException('Unsupported additional charge type');
    if (!/^(0|[1-9]\d*)(\.\d{1,4})?$/.test(input.amount))
      throw new BadRequestException(
        'Charge amount must be a non-negative decimal with at most four places',
      );
    if (!input.description.trim())
      throw new BadRequestException('A charge description is required');
    return this.db.transaction(async (manager) => {
      const booking = await manager
        .createQueryBuilder()
        .select('b.id')
        .from('booking', 'b')
        .where("b.id = :id AND b.status = 'IN_USE'", { id })
        .setLock('pessimistic_write')
        .getRawOne();
      if (!booking)
        throw new ConflictException(
          'Additional charges can only be added to an in-use booking',
        );
      const chargeId = randomUUID();
      await manager
        .createQueryBuilder()
        .insert()
        .into('additional_charge')
        .values({
          id: chargeId,
          booking_id: id,
          type: input.type,
          description: input.description.trim(),
          quantity: 1,
          unit_price: input.amount,
          amount: input.amount,
          status: 'PENDING',
          created_by: actor.id,
        })
        .execute();
      return { id: chargeId, status: 'PENDING' };
    });
  }

  async chargeStatus(id: string, chargeId: string, status: string) {
    if (status !== 'CONFIRMED' && status !== 'WAIVED')
      throw new BadRequestException(
        'Charge status must be CONFIRMED or WAIVED',
      );
    const result = await this.db
      .createQueryBuilder()
      .update('additional_charge')
      .set({ status })
      .where("booking_id = :id AND id = :chargeId AND status = 'PENDING'", {
        id,
        chargeId,
      })
      .returning('id')
      .execute();
    if (!result.raw[0]) throw new NotFoundException('Pending charge not found');
    return { id: result.raw[0].id, status };
  }

  async reports(input: ReportFilterInput) {
    const from = instant(input.createdFrom),
      to = instant(input.createdTo);
    if (Date.parse(to) <= Date.parse(from))
      throw new BadRequestException('Report end must be after start');
    const builder = this.db
      .createQueryBuilder()
      .select([
        'b.id AS id',
        'b.pickup_branch_id AS "branchId"',
        'o.car_type_id AS "carTypeId"',
        'b.created_at AS "createdAt"',
        'b.status AS status',
        'b.currency_code AS currency',
        'b.total_amount::text AS total',
      ])
      .from('booking', 'b')
      .innerJoin('car_type_branch', 'o', 'o.id = b.car_type_branch_id')
      .innerJoin('branch', 'br', 'br.id = b.pickup_branch_id')
      .innerJoin('country', 'c', 'c.id = br.country_id')
      .where('b.created_at >= :from AND b.created_at < :to', { from, to });
    if (input.branchId)
      builder.andWhere('b.pickup_branch_id = :branchId', {
        branchId: input.branchId,
      });
    if (input.countryCode)
      builder.andWhere('upper(c.code) = upper(:countryCode)', {
        countryCode: input.countryCode,
      });
    const rows = await builder.getRawMany<Record<string, any>>();
    const charges = rows.length
      ? await this.db
          .createQueryBuilder()
          .select(['a.booking_id AS "bookingId"', 'a.amount::text AS amount'])
          .from('additional_charge', 'a')
          .where(
            "a.status = 'CONFIRMED' AND a.booking_id IN (:...bookingIds)",
            {
              bookingIds: rows.map(({ id }) => id),
            },
          )
          .getRawMany<{ bookingId: string; amount: string }>()
      : [];
    const chargesByBooking = new Map<string, string[]>();
    for (const charge of charges) {
      const list = chargesByBooking.get(charge.bookingId) ?? [];
      list.push(charge.amount);
      chargesByBooking.set(charge.bookingId, list);
    }
    return summarizeBookings({
      createdFrom: from,
      createdTo: to,
      bookings: rows.map((b) => ({
        branchId: b.branchId,
        carTypeId: b.carTypeId,
        createdAt: new Date(String(b.createdAt)).toISOString(),
        status: b.status,
        totalAmount: { amount: b.total, currency: b.currency },
        confirmedAdditionalCharges: (chargesByBooking.get(b.id) ?? []).map(
          (amount) => ({
            amount,
            currency: b.currency,
          }),
        ),
      })),
    });
  }

  async members(query?: string) {
    const builder = this.db
      .createQueryBuilder()
      .select([
        'u.id AS id',
        'u.name AS name',
        'u.email AS email',
        'u.phone AS phone',
        'u.is_suspended AS "isSuspended"',
        'count(b.id)::int AS "bookingCount"',
      ])
      .from('app_user', 'u')
      .leftJoin('booking', 'b', 'b.user_id = u.id')
      .where("u.role = 'CUSTOMER'")
      .groupBy('u.id')
      .orderBy('u.name');
    const search = query?.trim();
    if (search)
      builder.andWhere('(u.name ILIKE :search OR u.email ILIKE :search)', {
        search: `%${search}%`,
      });
    return builder.getRawMany();
  }

  async member(id: string) {
    const customer = await this.db
      .createQueryBuilder()
      .select([
        'u.id AS id',
        'u.name AS name',
        'u.email AS email',
        'u.phone AS phone',
        'u.is_suspended AS "isSuspended"',
        'u.created_at AS "createdAt"',
      ])
      .from('app_user', 'u')
      .where("u.id = :id AND u.role = 'CUSTOMER'", { id })
      .getRawOne<Record<string, any>>();
    if (!customer) throw new NotFoundException('Customer not found');
    return { ...customer, bookings: await this.mine(id) };
  }

  async suspend(id: string, suspended: boolean) {
    return this.db.transaction(async (manager) => {
      const result = await manager
        .createQueryBuilder()
        .update('app_user')
        .set({ is_suspended: suspended, updated_at: () => 'now()' })
        .where("id = :id AND role = 'CUSTOMER'", { id })
        .returning('id')
        .execute();
      if (!result.raw[0]) throw new NotFoundException('Customer not found');
      if (suspended)
        await manager
          .createQueryBuilder()
          .update('user_session')
          .set({ revoked_at: () => 'now()' })
          .where('user_id = :id AND revoked_at IS NULL', { id })
          .execute();
      return { id, isSuspended: suspended };
    });
  }
}
