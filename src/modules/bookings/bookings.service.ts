import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
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
    const offers = await manager.query<Record<string, any>[]>(
      `SELECT o.id, o.branch_id AS "branchId", o.base_hourly_rate::text AS hourly, o.base_daily_rate::text AS daily, o.currency_code AS currency, b.timezone
       FROM car_type_branch o JOIN branch b ON b.id=o.branch_id JOIN car_type t ON t.id=o.car_type_id
       WHERE o.id=$1 AND o.is_active AND b.is_active AND t.is_active`,
      [input.offerId],
    );
    const offer = offers[0];
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
      const rows = await manager.query<PriceRow[]>(
        `SELECT id, pricing_type AS "pricingType", quantity_stock AS "quantityStock", price::text, $2::char(3) AS currency FROM car_option WHERE id=$1 AND branch_id=$3 AND is_active`,
        [item.carOptionId, offer.currency, offer.branchId],
      );
      const option = rows[0];
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
        const reservations = await manager.query<Record<string, any>[]>(
          `SELECT bo.quantity,b.pickup_at AS "pickupAt",COALESCE(b.actual_return_at,b.return_at) AS "returnAt" FROM booking_option bo JOIN booking b ON b.id=bo.booking_id WHERE bo.car_option_id=$1 AND b.status IN ('APPROVED','IN_USE')`,
          [item.carOptionId],
        );
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
    const vehicleCapacity = Number(
      (
        await manager.query<Record<string, number>[]>(
          `SELECT count(*)::int AS count FROM car WHERE car_type_branch_id=$1 AND status='ACTIVE' AND is_active`,
          [offer.id],
        )
      )[0].count,
    );
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
    let alreadyCheckedOut = false;
    const result = await this.db.transaction(async (manager) => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        input.checkoutKey,
      ]);
      const existing = (
        await manager.query<Record<string, string>[]>(
          `SELECT id,booking_number AS "bookingNumber",status,total_amount::text AS "totalAmount",currency_code AS "currencyCode",user_id AS "userId" FROM booking WHERE checkout_key=$1`,
          [input.checkoutKey],
        )
      )[0];
      if (existing) {
        alreadyCheckedOut = true;
        if (actor && existing.userId !== actor.id)
          throw new ForbiddenException();
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
        await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
          `account:${email}`,
        ]);
        const accountExists = await manager.query(
          `SELECT id FROM app_user WHERE email=$1`,
          [email],
        );
        if (accountExists.length)
          throw new ConflictException(
            'An account with this email already exists',
          );
        const id = randomUUID();
        const rows = await manager.query<Record<string, string>[]>(
          `INSERT INTO app_user(id,email,password_hash,name,phone,role) VALUES($1,$2,$3,$4,$5,'CUSTOMER') RETURNING id`,
          [
            id,
            email,
            await this.passwords.hash(input.customerPassword),
            input.customerName.trim(),
            input.customerPhone.trim(),
          ],
        );
        customerId = rows[0]?.id;
        await manager.query(
          `INSERT INTO user_session(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '14 days')`,
          [createHash('sha256').update(token!).digest('hex'), customerId],
        );
      }
      const quote = await this.quote(input, manager);
      const bookingId = randomUUID();
      const bookingNumber = `F${Date.now().toString(36).toUpperCase()}${randomBytes(3).toString('hex').toUpperCase()}`;
      await manager.query(
        `INSERT INTO booking(id,booking_number,checkout_key,user_id,car_type_branch_id,pickup_branch_id,return_branch_id,pickup_at,return_at,status,currency_code,daily_rate_at_booking,hourly_rate_at_booking,charged_days,charged_hours,rental_subtotal,options_subtotal,total_amount)
        VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8,'PENDING',$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          bookingId,
          bookingNumber,
          input.checkoutKey,
          customerId,
          quote.offerId,
          quote.branchId,
          quote.pickupAt,
          quote.returnAt,
          quote.currencyCode,
          quote.dailyRateAtBooking,
          quote.hourlyRateAtBooking,
          quote.chargedDays,
          quote.chargedHours,
          quote.rentalSubtotal,
          quote.optionsSubtotal,
          quote.totalAmount,
        ],
      );
      for (const line of quote.options)
        await manager.query(
          `INSERT INTO booking_option(id,booking_id,car_option_id,quantity,unit_price_at_booking,charged_units,total_amount) VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [
            randomUUID(),
            bookingId,
            line.carOptionId,
            line.quantity,
            line.unitPrice,
            line.chargedUnits,
            line.totalAmount,
          ],
        );
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
      ...(token && !alreadyCheckedOut ? { sessionToken: token } : {}),
    };
  }

  async mine(userId: string) {
    return this.db.query<Record<string, unknown>[]>(
      `SELECT b.id,b.booking_number AS "bookingNumber",b.status,b.pickup_at AS "pickupAt",b.return_at AS "returnAt",b.total_amount::text AS "totalAmount",b.currency_code AS "currencyCode",t.brand,t.model,br.name AS "branchName"
      FROM booking b JOIN car_type_branch o ON o.id=b.car_type_branch_id JOIN car_type t ON t.id=o.car_type_id JOIN branch br ON br.id=b.pickup_branch_id WHERE b.user_id=$1 ORDER BY b.created_at DESC`,
      [userId],
    );
  }

  async get(id: string, actor: AuthUser) {
    const rows = await this.db.query<Record<string, any>[]>(
      `SELECT b.*, b.booking_number AS "bookingNumber", b.user_id AS "userId", b.car_type_branch_id AS "carTypeBranchId", b.car_id AS "carId", b.pickup_at AS "pickupAt", b.return_at AS "returnAt", b.actual_return_at AS "actualReturnAt", b.currency_code AS "currencyCode", b.daily_rate_at_booking::text AS "dailyRateAtBooking", b.hourly_rate_at_booking::text AS "hourlyRateAtBooking", b.charged_days AS "chargedDays", b.charged_hours AS "chargedHours", b.rental_subtotal::text AS "rentalSubtotal", b.options_subtotal::text AS "optionsSubtotal", b.total_amount::text AS "totalAmount", b.rejection_reason AS "rejectionReason", b.cancellation_reason AS "cancellationReason", b.created_at AS "createdAt", t.brand,t.model,br.name AS "branchName"
      FROM booking b JOIN car_type_branch o ON o.id=b.car_type_branch_id JOIN car_type t ON t.id=o.car_type_id JOIN branch br ON br.id=b.pickup_branch_id WHERE b.id=$1`,
      [id],
    );
    const booking = rows[0];
    if (!booking) throw new NotFoundException('Booking not found');
    if (actor.role !== UserRole.ADMIN && booking.userId !== actor.id)
      throw new ForbiddenException();
    booking.options = await this.db.query(
      `SELECT bo.id,bo.car_option_id AS "carOptionId",co.name,bo.quantity,bo.unit_price_at_booking::text AS "unitPriceAtBooking",bo.charged_units AS "chargedUnits",bo.total_amount::text AS "totalAmount" FROM booking_option bo JOIN car_option co ON co.id=bo.car_option_id WHERE bo.booking_id=$1`,
      [id],
    );
    booking.charges = await this.db.query(
      `SELECT id,type,description,booking_option_id AS "bookingOptionId",quantity,unit_price::text AS "unitPrice",amount::text,status,created_at AS "createdAt" FROM additional_charge WHERE booking_id=$1 ORDER BY created_at`,
      [id],
    );
    booking.finalAmount = await this.finalAmount(this.db.manager, id);
    return booking;
  }

  async cancel(id: string, actor: AuthUser, reason?: string) {
    return this.db.transaction(async (manager) => {
      const rows = await manager.query<Record<string, any>[]>(
        `SELECT id,user_id AS "userId",status,pickup_at AS "pickupAt" FROM booking WHERE id=$1 FOR UPDATE`,
        [id],
      );
      const b = rows[0];
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
      await manager.query(
        `UPDATE booking SET status='CANCELLED',cancellation_reason=$2,updated_at=now() WHERE id=$1`,
        [id, actor.role === UserRole.ADMIN ? reason!.trim() : null],
      );
      return { id, status: 'CANCELLED' };
    });
  }

  private async reserved(
    manager: EntityManager,
    ctbId: string,
    excludeId?: string,
  ) {
    const rows = await manager.query<Record<string, any>[]>(
      `SELECT id,pickup_at AS "pickupAt",return_at AS "returnAt",actual_return_at AS "actualReturnAt",status FROM booking WHERE car_type_branch_id=$1 AND status IN ('APPROVED','IN_USE','COMPLETED') AND ($2::uuid IS NULL OR id<>$2)`,
      [ctbId, excludeId ?? null],
    );
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
    const capacity = Number(
      (
        await manager.query<Record<string, number>[]>(
          `SELECT count(*)::int AS count FROM car WHERE car_type_branch_id=$1 AND status='ACTIVE' AND is_active`,
          [ctbId],
        )
      )[0].count,
    );
    const rows = await manager.query<Record<string, any>[]>(
      `SELECT id,pickup_at AS "pickupAt",return_at AS "returnAt",actual_return_at AS "actualReturnAt" FROM booking WHERE car_type_branch_id=$1 AND status IN ('APPROVED','IN_USE','COMPLETED') ORDER BY pickup_at`,
      [ctbId],
    );
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
    return this.db.query<Record<string, unknown>[]>(
      `SELECT b.id,b.booking_number AS "bookingNumber",b.status,b.pickup_at AS "pickupAt",b.return_at AS "returnAt",b.total_amount::text AS "totalAmount",b.currency_code AS "currencyCode",u.name AS "customerName",u.email AS "customerEmail",t.brand,t.model,br.name AS "branchName",
        COALESCE((SELECT json_agg(json_build_object('id',a.id,'type',a.type,'description',a.description,'amount',a.amount::text,'status',a.status) ORDER BY a.created_at) FROM additional_charge a WHERE a.booking_id=b.id),'[]'::json) AS charges
       FROM booking b JOIN app_user u ON u.id=b.user_id JOIN car_type_branch o ON o.id=b.car_type_branch_id JOIN car_type t ON t.id=o.car_type_id JOIN branch br ON br.id=b.pickup_branch_id WHERE ($1::text IS NULL OR b.status=$1) ORDER BY b.created_at`,
      [status ?? null],
    );
  }

  async approve(id: string, actor: AuthUser) {
    return this.db.transaction(async (manager) => {
      const row = (
        await manager.query<Record<string, any>[]>(
          `SELECT * FROM booking WHERE id=$1 FOR UPDATE`,
          [id],
        )
      )[0];
      if (!row) throw new NotFoundException('Booking not found');
      if (row.status !== 'PENDING')
        throw new ConflictException('Only pending bookings can be approved');
      await manager.query(
        `SELECT id FROM car_type_branch WHERE id=$1 FOR UPDATE`,
        [row.car_type_branch_id],
      );
      const cars = (
        await manager.query<Record<string, number>[]>(
          `SELECT count(*)::int AS count FROM car WHERE car_type_branch_id=$1 AND status='ACTIVE' AND is_active`,
          [row.car_type_branch_id],
        )
      )[0].count;
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
      const options = await manager.query<Record<string, any>[]>(
        `SELECT bo.car_option_id AS id,bo.quantity,co.quantity_stock AS stock FROM booking_option bo JOIN car_option co ON co.id=bo.car_option_id WHERE bo.booking_id=$1 AND co.quantity_stock IS NOT NULL ORDER BY bo.car_option_id`,
        [id],
      );
      for (const option of options) {
        await manager.query(
          `SELECT id FROM car_option WHERE id=$1 FOR UPDATE`,
          [option.id],
        );
        const reservations = await manager.query<Record<string, any>[]>(
          `SELECT bo.quantity,b.pickup_at AS "pickupAt",COALESCE(b.actual_return_at,b.return_at) AS "returnAt" FROM booking_option bo JOIN booking b ON b.id=bo.booking_id WHERE bo.car_option_id=$1 AND b.status IN ('APPROVED','IN_USE') AND b.id<>$2`,
          [option.id, id],
        );
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
      await manager.query(
        `UPDATE booking SET status='APPROVED',approved_by=$2,approved_at=now(),updated_at=now() WHERE id=$1`,
        [id, actor.id],
      );
      return { id, status: 'APPROVED' };
    });
  }

  async reject(id: string, reason: string) {
    if (!reason.trim())
      throw new BadRequestException('A rejection reason is required');
    const rows = await this.db.query<Record<string, string>[]>(
      `UPDATE booking SET status='REJECTED',rejection_reason=$2,updated_at=now() WHERE id=$1 AND status='PENDING' RETURNING id`,
      [id, reason.trim()],
    );
    if (!rows[0])
      throw new ConflictException('Only pending bookings can be rejected');
    return { id, status: 'REJECTED' };
  }

  async pickup(id: string, carId: string) {
    return this.db.transaction(async (manager) => {
      const booking = (
        await manager.query<Record<string, any>[]>(
          `SELECT * FROM booking WHERE id=$1 FOR UPDATE`,
          [id],
        )
      )[0];
      if (!booking) throw new NotFoundException('Booking not found');
      const car = (
        await manager.query<Record<string, any>[]>(
          `SELECT c.id,c.car_type_branch_id AS "carTypeBranchId",c.status,c.is_active FROM car c WHERE id=$1 FOR UPDATE`,
          [carId],
        )
      )[0];
      if (!car) throw new NotFoundException('Car not found');
      const current = new Date();
      const active =
        (
          await manager.query(
            `SELECT id FROM booking WHERE car_id=$1 AND status='IN_USE' AND actual_return_at IS NULL AND id<>$2`,
            [carId, id],
          )
        ).length > 0;
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
      await manager.query(
        `UPDATE booking SET status='IN_USE',car_id=$2,updated_at=now() WHERE id=$1`,
        [id, carId],
      );
      return { id, status: 'IN_USE', carId };
    });
  }

  async pickupCars(id: string) {
    const booking = (
      await this.db.query<Record<string, string>[]>(
        `SELECT car_type_branch_id AS "carTypeBranchId" FROM booking WHERE id=$1 AND status='APPROVED'`,
        [id],
      )
    )[0];
    if (!booking)
      throw new ConflictException('Booking is not ready for pickup');
    return this.db.query<Record<string, unknown>[]>(
      `SELECT c.id,c.license_plate AS "licensePlate",c.status,
        EXISTS(SELECT 1 FROM booking active WHERE active.car_id=c.id AND active.status='IN_USE' AND active.actual_return_at IS NULL) AS "isOutOnRent",
        COALESCE((SELECT CASE WHEN previous.actual_return_at IS NULL THEN previous.return_at+interval '2 hours' ELSE previous.actual_return_at+interval '1 hour' END FROM booking previous WHERE previous.car_id=c.id AND previous.status IN ('IN_USE','COMPLETED') ORDER BY COALESCE(previous.actual_return_at,previous.return_at) DESC LIMIT 1),'-infinity'::timestamptz) AS "readyAt"
       FROM car c WHERE c.car_type_branch_id=$1 AND c.is_active ORDER BY c.license_plate`,
      [booking.carTypeBranchId],
    );
  }

  private async carReadyAt(manager: EntityManager, carId: string) {
    const rows = await manager.query<Record<string, any>[]>(
      `SELECT return_at AS "returnAt",actual_return_at AS "actualReturnAt" FROM booking WHERE car_id=$1 AND status IN ('IN_USE','COMPLETED') ORDER BY COALESCE(actual_return_at,return_at) DESC LIMIT 1`,
      [carId],
    );
    return rows[0]
      ? calculateReadyAt({
          returnAt: new Date(String(rows[0].returnAt)).toISOString(),
          actualReturnAt: rows[0].actualReturnAt
            ? new Date(String(rows[0].actualReturnAt)).toISOString()
            : null,
        }).readyAt
      : '1970-01-01T00:00:00Z';
  }

  async returnPreview(id: string) {
    const row = (
      await this.db.query<Record<string, any>[]>(
        `SELECT b.*,b.car_type_branch_id AS "carTypeBranchId",b.pickup_at AS "pickupAt",b.return_at AS "returnAt",b.daily_rate_at_booking::text AS daily,b.hourly_rate_at_booking::text AS hourly,b.rental_subtotal::text AS rental,b.currency_code AS currency,br.timezone FROM booking b JOIN car_type_branch o ON o.id=b.car_type_branch_id JOIN branch br ON br.id=o.branch_id WHERE b.id=$1`,
        [id],
      )
    )[0];
    if (!row) throw new NotFoundException('Booking not found');
    if (row.status !== 'IN_USE')
      throw new ConflictException('Only in-use bookings can be returned');
    const options = await this.db.query<Record<string, any>[]>(
      `SELECT bo.id,bo.car_option_id AS "carOptionId",co.pricing_type AS "pricingType",bo.quantity,bo.unit_price_at_booking::text AS "unitPrice",bo.charged_units AS "chargedUnits",bo.total_amount::text AS "totalAmount" FROM booking_option bo JOIN car_option co ON co.id=bo.car_option_id WHERE bo.booking_id=$1`,
      [id],
    );
    const lines = calculateLateReturnCharges({
      pickupAt: new Date(String(row.pickupAt)).toISOString(),
      returnAt: new Date(String(row.returnAt)).toISOString(),
      actualReturnAt: new Date().toISOString(),
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
    return { actualReturnAt: new Date().toISOString(), lines };
  }

  async completeReturn(id: string, actor: AuthUser, charges: AddChargeInput[]) {
    return this.db.transaction(async (manager) => {
      const b = (
        await manager.query<Record<string, any>[]>(
          `SELECT * FROM booking WHERE id=$1 FOR UPDATE`,
          [id],
        )
      )[0];
      if (!b) throw new NotFoundException('Booking not found');
      if (b.status !== 'IN_USE')
        throw new ConflictException('Only in-use bookings can be returned');
      await manager.query(
        `SELECT id FROM car_type_branch WHERE id=$1 FOR UPDATE`,
        [b.car_type_branch_id],
      );
      if (b.actual_return_at) {
        const existing = await manager.query<Record<string, unknown>[]>(
          `SELECT id,type,description,quantity,unit_price::text AS "unitPrice",amount::text,status FROM additional_charge WHERE booking_id=$1 AND type IN ('EXTRA_RENTAL','EXTRA_OPTION') ORDER BY created_at`,
          [id],
        );
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
        await manager.query(
          `INSERT INTO additional_charge(id,booking_id,booking_option_id,type,description,quantity,unit_price,amount,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'CONFIRMED',$9) ON CONFLICT DO NOTHING`,
          [
            randomUUID(),
            id,
            line.kind === 'EXTRA_OPTION' ? line.bookingOptionId : null,
            line.kind,
            line.kind === 'EXTRA_RENTAL'
              ? 'Additional rental time'
              : 'Additional option rental',
            line.quantity,
            line.unitPrice.amount,
            line.amount.amount,
            actor.id,
          ],
        );
      for (const charge of charges) {
        if (!['FUEL', 'DAMAGE', 'OTHER'].includes(charge.type))
          throw new BadRequestException('Unsupported additional charge type');
        if (!/^(0|[1-9]\d*)(\.\d{1,4})?$/.test(charge.amount))
          throw new BadRequestException(
            'Charge amount must be a non-negative decimal with at most four places',
          );
        await manager.query(
          `INSERT INTO additional_charge(id,booking_id,type,description,quantity,unit_price,amount,status,created_by) VALUES($1,$2,$3,$4,1,$5,$5,'PENDING',$6)`,
          [
            randomUUID(),
            id,
            charge.type,
            charge.description.trim(),
            charge.amount,
            actor.id,
          ],
        );
      }
      await manager.query(
        `UPDATE booking SET actual_return_at=$2,updated_at=now() WHERE id=$1`,
        [id, preview.actualReturnAt],
      );
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
      const b = (
        await manager.query<Record<string, any>[]>(
          `SELECT id,status FROM booking WHERE id=$1 FOR UPDATE`,
          [id],
        )
      )[0];
      if (!b) throw new NotFoundException('Booking not found');
      if (b.status !== 'IN_USE')
        throw new ConflictException(
          'Booking is not awaiting return confirmation',
        );
      const pending = await manager.query(
        `SELECT id FROM additional_charge WHERE booking_id=$1 AND status='PENDING' LIMIT 1`,
        [id],
      );
      if (pending.length)
        throw new ConflictException(
          'Confirm or waive pending charges before completing the booking',
        );
      await manager.query(
        `UPDATE booking SET status='COMPLETED',updated_at=now() WHERE id=$1`,
        [id],
      );
      return {
        id,
        status: 'COMPLETED',
        finalAmount: await this.finalAmount(manager, id),
      };
    });
  }

  private async finalAmount(manager: EntityManager, id: string) {
    const rows = await manager.query<Record<string, string>[]>(
      `SELECT b.total_amount::text AS total,COALESCE(sum(a.amount) FILTER(WHERE a.status='CONFIRMED'),0)::text AS extra FROM booking b LEFT JOIN additional_charge a ON a.booking_id=b.id WHERE b.id=$1 GROUP BY b.id`,
      [id],
    );
    return addDecimals(rows[0].total, rows[0].extra);
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
    const rows = await this.db.query<Record<string, string>[]>(
      `INSERT INTO additional_charge(id,booking_id,type,description,quantity,unit_price,amount,status,created_by) SELECT $1,id,$3,$4,1,$5,$5,'PENDING',$6 FROM booking WHERE id=$2 AND status='IN_USE' RETURNING id`,
      [
        randomUUID(),
        id,
        input.type,
        input.description.trim(),
        input.amount,
        actor.id,
      ],
    );
    if (!rows[0])
      throw new ConflictException(
        'Additional charges can only be added to an in-use booking',
      );
    return { id: rows[0].id, status: 'PENDING' };
  }

  async chargeStatus(id: string, chargeId: string, status: string) {
    if (status !== 'CONFIRMED' && status !== 'WAIVED')
      throw new BadRequestException(
        'Charge status must be CONFIRMED or WAIVED',
      );
    const rows = await this.db.query<Record<string, string>[]>(
      `UPDATE additional_charge SET status=$3 WHERE id=$2 AND booking_id=$1 AND status='PENDING' RETURNING id`,
      [id, chargeId, status],
    );
    if (!rows[0]) throw new NotFoundException('Pending charge not found');
    return { id: rows[0].id, status };
  }

  async reports(input: ReportFilterInput) {
    const from = instant(input.createdFrom),
      to = instant(input.createdTo);
    if (Date.parse(to) <= Date.parse(from))
      throw new BadRequestException('Report end must be after start');
    const rows = await this.db.query<Record<string, any>[]>(
      `SELECT b.id,b.pickup_branch_id AS "branchId",o.car_type_id AS "carTypeId",b.created_at AS "createdAt",b.status,b.currency_code AS currency,b.total_amount::text AS total,COALESCE((SELECT json_agg(a.amount::text) FROM additional_charge a WHERE a.booking_id=b.id AND a.status='CONFIRMED'),'[]') AS charges
      FROM booking b JOIN car_type_branch o ON o.id=b.car_type_branch_id JOIN branch br ON br.id=b.pickup_branch_id JOIN country c ON c.id=br.country_id WHERE b.created_at >= $1 AND b.created_at < $2 AND ($3::uuid IS NULL OR b.pickup_branch_id=$3) AND ($4::text IS NULL OR upper(c.code)=upper($4))`,
      [from, to, input.branchId ?? null, input.countryCode ?? null],
    );
    return summarizeBookings({
      createdFrom: from,
      createdTo: to,
      bookings: rows.map((b) => ({
        branchId: b.branchId,
        carTypeId: b.carTypeId,
        createdAt: new Date(String(b.createdAt)).toISOString(),
        status: b.status,
        totalAmount: { amount: b.total, currency: b.currency },
        confirmedAdditionalCharges: (b.charges as string[]).map((amount) => ({
          amount,
          currency: b.currency,
        })),
      })),
    });
  }

  async members(query?: string) {
    return this.db.query<Record<string, unknown>[]>(
      `SELECT u.id,u.name,u.email,u.phone,u.is_suspended AS "isSuspended",count(b.id)::int AS "bookingCount" FROM app_user u LEFT JOIN booking b ON b.user_id=u.id WHERE u.role='CUSTOMER' AND ($1::text IS NULL OR u.name ILIKE '%'||$1||'%' OR u.email ILIKE '%'||$1||'%') GROUP BY u.id ORDER BY u.name`,
      [query?.trim() || null],
    );
  }

  async member(id: string) {
    const rows = await this.db.query<Record<string, any>[]>(
      `SELECT id,name,email,phone,is_suspended AS "isSuspended",created_at AS "createdAt" FROM app_user WHERE id=$1 AND role='CUSTOMER'`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException('Customer not found');
    return { ...rows[0], bookings: await this.mine(id) };
  }

  async suspend(id: string, suspended: boolean) {
    return this.db.transaction(async (manager) => {
      const rows = await manager.query<Record<string, string>[]>(
        `UPDATE app_user SET is_suspended=$2,updated_at=now() WHERE id=$1 AND role='CUSTOMER' RETURNING id`,
        [id, suspended],
      );
      if (!rows[0]) throw new NotFoundException('Customer not found');
      if (suspended)
        await manager.query(
          `UPDATE user_session SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`,
          [id],
        );
      return { id, isSuspended: suspended };
    });
  }
}
