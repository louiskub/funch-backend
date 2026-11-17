import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DateTime } from 'luxon';
import { randomUUID } from 'node:crypto';
import { FindOptionsWhere, Repository } from 'typeorm';
import { calculateAvailableQuantity, calculateReadyAt } from '../../core';
import { Branch } from '../catalog/entities/branch.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { Car } from './entities/car.entity';
import { CarType } from './entities/car-type.entity';
import { CarTypeBranch } from './entities/car-type-branch.entity';
import type {
  CarDto,
  CarTypeDto,
  FleetTimelineDetailQueryDto,
  FleetTimelineQueryDto,
  OfferDto,
  UpdateCarDto,
  UpdateCarTypeDto,
  UpdateOfferDto,
} from './dto/admin-fleet.dto';

@Injectable()
export class AdminFleetService {
  constructor(
    @InjectRepository(Car)
    private readonly carRepo: Repository<Car>,
    @InjectRepository(CarType)
    private readonly carTypeRepo: Repository<CarType>,
    @InjectRepository(CarTypeBranch)
    private readonly offerRepo: Repository<CarTypeBranch>,
    @InjectRepository(Branch)
    private readonly branchRepo: Repository<Branch>,
  ) {}

  async branches() {
    return this.branchRepo
      .createQueryBuilder('b')
      .select([
        'b.id AS id',
        'b.code AS code',
        'b.name AS name',
        'b.city AS city',
        'b.is_active AS "isActive"',
        'b.timezone AS timezone',
        'c.code AS "countryCode"',
        'c.currency_code AS "currencyCode"',
      ])
      .innerJoin('country', 'c', 'c.id = b.country_id')
      .orderBy('c.name')
      .addOrderBy('b.name')
      .getRawMany();
  }

  async fleetTimeline(input: FleetTimelineQueryDto) {
    const branch = await this.branchRepo.findOneBy({ id: input.branchId });
    if (!branch) throw new NotFoundException('Branch not found');

    const now = DateTime.utc();
    const branchNow = now.setZone(branch.timezone);
    if (!branchNow.isValid)
      throw new InternalServerErrorException('Branch timezone is invalid');
    const currentMonth = branchNow.toFormat('yyyy-MM');
    const month = input.month ?? currentMonth;
    const monthStart = DateTime.fromFormat(month, 'yyyy-MM', {
      zone: branch.timezone,
    }).startOf('month');
    if (!monthStart.isValid || monthStart.toFormat('yyyy-MM') !== month)
      throw new BadRequestException('Month must use YYYY-MM format');
    if (month < currentMonth)
      throw new BadRequestException('Past months are not available');

    const monthEnd = monthStart.plus({ months: 1 });
    const offers = await this.offerRepo
      .createQueryBuilder('o')
      .select([
        'o.id AS "carTypeBranchId"',
        'o.car_type_id AS "carTypeId"',
        't.brand AS brand',
        't.model AS model',
      ])
      .innerJoin('car_type', 't', 't.id = o.car_type_id')
      .where('o.branch_id = :branchId', { branchId: branch.id })
      .orderBy('t.brand')
      .addOrderBy('t.model')
      .getRawMany<{
        carTypeBranchId: string;
        carTypeId: string;
        brand: string;
        model: string;
      }>();

    const offerIds = offers.map((offer) => offer.carTypeBranchId);
    const capacities = offerIds.length
      ? await this.carRepo
          .createQueryBuilder('c')
          .select('c.car_type_branch_id', 'carTypeBranchId')
          .addSelect('count(*)::int', 'totalCapacity')
          .where('c.car_type_branch_id IN (:...offerIds)', { offerIds })
          .andWhere("c.status = 'ACTIVE' AND c.is_active")
          .groupBy('c.car_type_branch_id')
          .getRawMany<{ carTypeBranchId: string; totalCapacity: number }>()
      : [];
    const capacityByOffer = new Map(
      capacities.map(({ carTypeBranchId, totalCapacity }) => [
        carTypeBranchId,
        Number(totalCapacity),
      ]),
    );
    const bookings = offerIds.length
      ? await this.carRepo.manager
          .getRepository(Booking)
          .createQueryBuilder('b')
          .select([
            'b.car_type_branch_id AS "carTypeBranchId"',
            'b.pickup_at AS "pickupAt"',
            'b.return_at AS "returnAt"',
            'b.actual_return_at AS "actualReturnAt"',
            'b.ready_at AS "readyAt"',
            'b.status AS status',
          ])
          .where('b.car_type_branch_id IN (:...offerIds)', { offerIds })
          .andWhere("b.status IN ('PENDING','APPROVED','IN_USE','COMPLETED')")
          .andWhere('b.pickup_at < :monthEnd', {
            monthEnd: monthEnd.toUTC().toISO(),
          })
          .andWhere(
            `COALESCE(
              b.ready_at,
              CASE
                WHEN b.actual_return_at IS NOT NULL THEN b.actual_return_at + INTERVAL '1 hour'
                ELSE GREATEST(b.return_at + INTERVAL '2 hours', CAST(:now AS timestamptz) + INTERVAL '2 hours')
              END
            ) > :monthStart`,
            { now: now.toISO(), monthStart: monthStart.toUTC().toISO() },
          )
          .getRawMany<{
            carTypeBranchId: string;
            pickupAt: Date;
            returnAt: Date;
            actualReturnAt: Date | null;
            readyAt: Date | null;
            status: string;
          }>()
      : [];

    const reservations = new Map<
      string,
      { startsAt: string; endsAt: string }[]
    >();
    const pendingReservations = new Map<
      string,
      { startsAt: string; endsAt: string }[]
    >();
    for (const booking of bookings) {
      const interval = {
        startsAt: new Date(booking.pickupAt).toISOString(),
        endsAt: calculateReadyAt({
          returnAt: new Date(booking.returnAt).toISOString(),
          actualReturnAt: booking.actualReturnAt
            ? new Date(booking.actualReturnAt).toISOString()
            : null,
          readyAt: booking.readyAt
            ? new Date(booking.readyAt).toISOString()
            : null,
          now: now.toISO(),
        }).readyAt,
      };
      const offerReservations = reservations.get(booking.carTypeBranchId) ?? [];
      offerReservations.push(interval);
      reservations.set(booking.carTypeBranchId, offerReservations);
      if (booking.status === 'PENDING') {
        const offerPendingReservations =
          pendingReservations.get(booking.carTypeBranchId) ?? [];
        offerPendingReservations.push(interval);
        pendingReservations.set(
          booking.carTypeBranchId,
          offerPendingReservations,
        );
      }
    }

    return {
      branch: { id: branch.id, name: branch.name, timezone: branch.timezone },
      month,
      daysCount: monthStart.daysInMonth,
      matrix: offers.map((offer) => {
        const totalCapacity = capacityByOffer.get(offer.carTypeBranchId) ?? 0;
        const reservedIntervals = reservations.get(offer.carTypeBranchId) ?? [];
        const pendingIntervals =
          pendingReservations.get(offer.carTypeBranchId) ?? [];
        return {
          ...offer,
          totalCapacity,
          days: Array.from({ length: monthStart.daysInMonth }, (_, index) => {
            const dayStart = monthStart.plus({ days: index }).startOf('day');
            const dayEnd = dayStart.plus({ days: 1 });
            const requestedInterval = {
              startsAt: dayStart.toUTC().toISO(),
              endsAt: dayEnd.toUTC().toISO(),
            };
            const capacity = calculateAvailableQuantity({
              requestedInterval,
              capacity: totalCapacity,
              reservedIntervals: reservedIntervals.map((interval) => ({
                ...interval,
                quantity: 1,
              })),
            });
            const pending = calculateAvailableQuantity({
              requestedInterval,
              capacity: totalCapacity,
              reservedIntervals: pendingIntervals.map((interval) => ({
                ...interval,
                quantity: 1,
              })),
            }).peakReserved;
            return {
              day: index + 1,
              date: dayStart.toISODate(),
              totalCapacity,
              peakReserved: capacity.peakReserved,
              peakPending: pending,
              available: capacity.availableQuantity,
              status:
                capacity.availableQuantity > 2
                  ? 'HEALTHY'
                  : capacity.availableQuantity > 0
                    ? 'LOW'
                    : 'FULL',
            };
          }),
        };
      }),
    };
  }

  async fleetTimelineDetails(input: FleetTimelineDetailQueryDto) {
    const offer = await this.offerRepo
      .createQueryBuilder('o')
      .select([
        'o.id AS id',
        'o.branch_id AS "branchId"',
        't.brand AS brand',
        't.model AS model',
      ])
      .innerJoin('car_type', 't', 't.id = o.car_type_id')
      .where('o.id = :id', { id: input.carTypeBranchId })
      .getRawOne<{
        id: string;
        branchId: string;
        brand: string;
        model: string;
      }>();
    if (!offer) throw new NotFoundException('Car offer not found');

    const branch = await this.branchRepo.findOneBy({ id: offer.branchId });
    if (!branch) throw new NotFoundException('Branch not found');
    const dayStart = DateTime.fromFormat(input.date, 'yyyy-MM-dd', {
      zone: branch.timezone,
    }).startOf('day');
    const branchNow = DateTime.utc().setZone(branch.timezone);
    if (
      !dayStart.isValid ||
      dayStart.toISODate() !== input.date ||
      !branchNow.isValid
    ) {
      throw new BadRequestException('Date must be a valid branch-local date');
    }
    if (input.date < branchNow.toISODate())
      throw new BadRequestException('Past dates are not available');

    const dayEnd = dayStart.plus({ days: 1 });
    const dayInterval = {
      startsAt: dayStart.toUTC().toISO(),
      endsAt: dayEnd.toUTC().toISO(),
    };
    const now = DateTime.utc().toISO();
    const vehicleCapacity = Number(
      (
        await this.carRepo
          .createQueryBuilder('c')
          .select('count(*)::int', 'count')
          .where(
            "c.car_type_branch_id = :id AND c.status = 'ACTIVE' AND c.is_active",
            { id: offer.id },
          )
          .getRawOne<{ count: number }>()
      )?.count ?? 0,
    );
    const vehicleRows = await this.carRepo.manager
      .getRepository(Booking)
      .createQueryBuilder('b')
      .select([
        'b.booking_number AS "bookingNumber"',
        'b.status AS status',
        'b.pickup_at AS "pickupAt"',
        'b.return_at AS "returnAt"',
        'b.actual_return_at AS "actualReturnAt"',
        'b.ready_at AS "readyAt"',
        'c.license_plate AS "licensePlate"',
      ])
      .leftJoin('car', 'c', 'c.id = b.car_id')
      .where('b.car_type_branch_id = :id', { id: offer.id })
      .andWhere("b.status IN ('PENDING','APPROVED','IN_USE','COMPLETED')")
      .andWhere('b.pickup_at < :dayEnd', { dayEnd: dayInterval.endsAt })
      .andWhere(
        `COALESCE(
          b.ready_at,
          CASE
            WHEN b.actual_return_at IS NOT NULL THEN b.actual_return_at + INTERVAL '1 hour'
            ELSE GREATEST(b.return_at + INTERVAL '2 hours', CAST(:now AS timestamptz) + INTERVAL '2 hours')
          END
        ) > :dayStart`,
        { now, dayStart: dayInterval.startsAt },
      )
      .orderBy('b.pickup_at', 'ASC')
      .getRawMany<{
        bookingNumber: string;
        status: string;
        pickupAt: Date;
        returnAt: Date;
        actualReturnAt: Date | null;
        readyAt: Date | null;
        licensePlate: string | null;
      }>();
    const vehicleReservations = vehicleRows.map((row) => ({
      bookingNumber: row.bookingNumber,
      status: row.status,
      pickupAt: new Date(String(row.pickupAt)).toISOString(),
      returnAt: new Date(String(row.returnAt)).toISOString(),
      actualReturnAt: row.actualReturnAt
        ? new Date(String(row.actualReturnAt)).toISOString()
        : null,
      licensePlate: row.licensePlate,
      blockingUntil: calculateReadyAt({
        returnAt: new Date(String(row.returnAt)).toISOString(),
        actualReturnAt: row.actualReturnAt
          ? new Date(String(row.actualReturnAt)).toISOString()
          : null,
        readyAt: row.readyAt
          ? new Date(String(row.readyAt)).toISOString()
          : null,
        now,
      }).readyAt,
    }));
    const vehicleAvailability = calculateAvailableQuantity({
      requestedInterval: dayInterval,
      capacity: vehicleCapacity,
      reservedIntervals: vehicleReservations.map((row) => ({
        startsAt: row.pickupAt,
        endsAt: row.blockingUntil,
        quantity: 1,
      })),
    });
    const pendingVehicleAvailability = calculateAvailableQuantity({
      requestedInterval: dayInterval,
      capacity: vehicleCapacity,
      reservedIntervals: vehicleReservations
        .filter((row) => row.status === 'PENDING')
        .map((row) => ({
          startsAt: row.pickupAt,
          endsAt: row.blockingUntil,
          quantity: 1,
        })),
    });

    return {
      branch: { id: branch.id, name: branch.name, timezone: branch.timezone },
      date: input.date,
      vehicle: {
        carTypeBranchId: offer.id,
        brand: offer.brand,
        model: offer.model,
        totalCapacity: vehicleCapacity,
        peakReserved: vehicleAvailability.peakReserved,
        peakPending: pendingVehicleAvailability.peakReserved,
        available: vehicleAvailability.availableQuantity,
        bookings: vehicleReservations.map((row) => ({
          bookingNumber: row.bookingNumber,
          status: row.status,
          pickupAt: row.pickupAt,
          returnAt: row.returnAt,
          actualReturnAt: row.actualReturnAt,
          licensePlate: row.licensePlate,
          blockingUntil: row.blockingUntil,
        })),
      },
    };
  }

  async carTypes() {
    const rows = await this.carTypeRepo.find({
      order: { brand: 'ASC', model: 'ASC' },
    });
    return rows.map(
      ({
        id,
        brand,
        model,
        seats,
        transmission,
        fuelType,
        features,
        imageFileIds,
        isActive,
      }) => ({
        id,
        brand,
        model,
        seats,
        transmission,
        fuelType,
        features,
        imageFileIds,
        isActive,
      }),
    );
  }

  async createCarType(input: CarTypeDto) {
    try {
      const row = await this.carTypeRepo.save(
        this.carTypeRepo.create({
          id: randomUUID(),
          brand: input.brand.trim(),
          model: input.model.trim(),
          seats: input.seats,
          transmission: input.transmission,
          fuelType: input.fuelType,
          features: input.features,
        }),
      );
      return this.carTypeResponse(row);
    } catch (error) {
      this.translate(error);
    }
  }

  async updateCarType(id: string, input: UpdateCarTypeDto) {
    return this.updateEntity(this.carTypeRepo, id, input, (row) =>
      this.carTypeResponse(row),
    );
  }

  async offers() {
    return this.offerRepo
      .createQueryBuilder('o')
      .select([
        'o.id AS id',
        'o.car_type_id AS "carTypeId"',
        't.brand AS brand',
        't.model AS model',
        'o.branch_id AS "branchId"',
        'b.name AS "branchName"',
        'b.city AS city',
        'o.base_daily_rate::text AS "baseDailyRate"',
        'o.base_hourly_rate::text AS "baseHourlyRate"',
        'o.currency_code AS "currencyCode"',
        'o.supported_option_ids AS "supportedOptionIds"',
        'o.is_active AS "isActive"',
      ])
      .innerJoin('car_type', 't', 't.id = o.car_type_id')
      .innerJoin('branch', 'b', 'b.id = o.branch_id')
      .orderBy('b.name')
      .addOrderBy('t.brand')
      .addOrderBy('t.model')
      .getRawMany();
  }

  async createOffer(input: OfferDto) {
    try {
      return this.offerResponse(
        await this.offerRepo.save(
          this.offerRepo.create({
            id: randomUUID(),
            carTypeId: input.carTypeId,
            branchId: input.branchId,
            baseDailyRate: input.baseDailyRate,
            baseHourlyRate: input.baseHourlyRate,
            currencyCode: input.currencyCode,
            supportedOptionIds: input.supportedOptionIds ?? [],
          }),
        ),
      );
    } catch (error) {
      this.translate(error);
    }
  }

  async updateOffer(id: string, input: UpdateOfferDto) {
    return this.updateEntity(this.offerRepo, id, input, (row) =>
      this.offerResponse(row),
    );
  }

  async cars() {
    return this.carRepo
      .createQueryBuilder('c')
      .select([
        'c.id AS id',
        'c.car_type_branch_id AS "carTypeBranchId"',
        't.brand AS brand',
        't.model AS model',
        'b.name AS "branchName"',
        'b.timezone AS timezone',
        'c.vin AS vin',
        'c.license_plate AS "licensePlate"',
        'c.year AS year',
        'c.buy_date::text AS "buyDate"',
        'c.status AS status',
        'CASE WHEN bk.id IS NOT NULL THEN true ELSE false END AS "inUse"',
        'bk.booking_number AS "activeBookingNumber"',
        'bk.pickup_at AS "activePickupAt"',
        'bk.return_at AS "activeReturnAt"',
      ])
      .innerJoin('car_type_branch', 'o', 'o.id = c.car_type_branch_id')
      .innerJoin('car_type', 't', 't.id = o.car_type_id')
      .innerJoin('branch', 'b', 'b.id = o.branch_id')
      .leftJoin(
        'booking',
        'bk',
        "bk.car_id = c.id AND bk.status = 'IN_USE' AND bk.actual_return_at IS NULL",
      )
      .orderBy('b.name')
      .addOrderBy('t.brand')
      .addOrderBy('t.model')
      .addOrderBy('c.license_plate')
      .getRawMany();
  }

  async carHistory(carId: string) {
    const car = await this.carRepo.findOneBy({ id: carId });
    if (!car) throw new NotFoundException('Car not found');

    return this.carRepo.manager
      .createQueryBuilder()
      .select([
        'b.id AS id',
        'b.booking_number AS "bookingNumber"',
        'b.status AS status',
        'b.pickup_at AS "pickupAt"',
        'b.return_at AS "returnAt"',
        'b.actual_return_at AS "actualReturnAt"',
        'b.ready_at AS "readyAt"',
        'b.total_amount::text AS "totalAmount"',
        'b.currency_code AS "currencyCode"',
        'u.name AS "customerName"',
        'u.email AS "customerEmail"',
        'u.phone AS "customerPhone"',
        'pb.name AS "pickupBranchName"',
        'rb.name AS "returnBranchName"',
        'pb.timezone AS "pickupTimezone"',
        'rb.timezone AS "returnTimezone"',
        'b.created_at AS "createdAt"',
      ])
      .from('booking', 'b')
      .leftJoin('app_user', 'u', 'u.id = b.user_id')
      .leftJoin('branch', 'pb', 'pb.id = b.pickup_branch_id')
      .leftJoin('branch', 'rb', 'rb.id = b.return_branch_id')
      .where('b.car_id = :carId', { carId })
      .orderBy('b.pickup_at', 'DESC')
      .getRawMany();
  }

  async createCar(input: CarDto) {
    try {
      return this.carResponse(
        await this.carRepo.save(
          this.carRepo.create({
            id: randomUUID(),
            carTypeBranchId: input.carTypeBranchId,
            vin: input.vin.trim(),
            licensePlate: input.licensePlate.trim(),
            year: input.year,
            buyDate: input.buyDate ?? null,
            status: input.status,
          }),
        ),
      );
    } catch (error) {
      this.translate(error);
    }
  }

  async updateCar(id: string, input: UpdateCarDto) {
    return this.updateEntity(this.carRepo, id, input, (row) =>
      this.carResponse(row),
    );
  }

  async deleteCar(id: string) {
    const car = await this.carRepo.findOneBy({ id });
    if (!car) throw new NotFoundException('Car not found');

    const activeBooking = await this.carRepo.manager
      .createQueryBuilder()
      .select(['b.booking_number AS "bookingNumber"'])
      .from('booking', 'b')
      .where(
        "b.car_id = :id AND b.status = 'IN_USE' AND b.actual_return_at IS NULL",
        { id },
      )
      .getRawOne<{ bookingNumber: string }>();

    if (activeBooking) {
      throw new BadRequestException(
        `Cannot delete vehicle ${car.licensePlate} while it is currently in an active rental (Booking #${activeBooking.bookingNumber}).`,
      );
    }

    await this.carRepo.delete(id);
    return { id, deleted: true };
  }

  private async updateEntity<T extends CarType | CarTypeBranch | Car>(
    repo: Repository<T>,
    id: string,
    input: object,
    map: (row: T) => Record<string, unknown>,
  ) {
    const values = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    );
    if (!Object.keys(values).length)
      throw new BadRequestException('Provide at least one field to update');
    try {
      const row = await repo.findOneBy({ id } as FindOptionsWhere<T>);
      if (!row) throw new NotFoundException('Record not found');
      Object.assign(row, values);
      return map(await repo.save(row));
    } catch (error) {
      this.translate(error);
    }
  }

  private carTypeResponse(row: CarType) {
    return {
      id: row.id,
      brand: row.brand,
      model: row.model,
      seats: row.seats,
      transmission: row.transmission,
      fuelType: row.fuelType,
      features: row.features,
      isActive: row.isActive,
    };
  }

  private offerResponse(row: CarTypeBranch) {
    return {
      id: row.id,
      carTypeId: row.carTypeId,
      branchId: row.branchId,
      baseDailyRate: Number(row.baseDailyRate).toFixed(4),
      baseHourlyRate: Number(row.baseHourlyRate).toFixed(4),
      currencyCode: row.currencyCode,
      supportedOptionIds: row.supportedOptionIds ?? [],
      isActive: row.isActive,
    };
  }

  private carResponse(row: Car) {
    return {
      id: row.id,
      carTypeBranchId: row.carTypeBranchId,
      vin: row.vin,
      licensePlate: row.licensePlate,
      year: row.year,
      buyDate: row.buyDate,
      status: row.status,
    };
  }

  private translate(error: unknown): never {
    if (typeof error === 'object' && error !== null) {
      const driverError = Reflect.get(error, 'driverError');
      const code: unknown = Reflect.get(driverError ?? error, 'code');
      if (code === '23505')
        throw new ConflictException(
          'A record with this unique value already exists',
        );
      if (code === '23503')
        throw new BadRequestException(
          Reflect.get(driverError ?? error, 'constraint') ===
            'car_type_branch_currency_code_fkey'
            ? 'Currency code is not supported'
            : 'The selected car type, branch, or offer does not exist',
        );
      if (code === '23514' || code === '22P02' || code === '22003')
        throw new BadRequestException(
          'The submitted values are outside allowed ranges',
        );
    }
    throw error;
  }
}
