import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DateTime } from 'luxon';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { calculateAvailableQuantity } from '../../core';
import { Branch } from '../catalog/entities/branch.entity';
import { BookingOption } from '../bookings/entities/booking-option.entity';
import { CarOption } from './entities/car-option.entity';
import {
  CreateOptionDto,
  OptionTimelineDetailQueryDto,
  OptionTimelineQueryDto,
  UpdateOptionDto,
} from './dto/options.dto';

const response = (option: CarOption) => ({
  id: option.id,
  branchId: option.branchId,
  code: option.code,
  name: option.name,
  description: option.description,
  category: option.category,
  pricingType: option.pricingType,
  price: String(option.price),
  quantityStock: option.quantityStock,
  isActive: option.isActive,
});

@Injectable()
export class OptionsService {
  constructor(
    @InjectRepository(CarOption)
    private readonly carOptionRepo: Repository<CarOption>,
    @InjectRepository(Branch)
    private readonly branchRepo: Repository<Branch>,
    @InjectRepository(BookingOption)
    private readonly bookingOptionRepo: Repository<BookingOption>,
  ) {}

  async branches() {
    return this.branchRepo
      .createQueryBuilder('b')
      .select([
        'b.id AS id',
        'b.name AS name',
        'b.city AS city',
        'c.code AS "countryCode"',
      ])
      .innerJoin('country', 'c', 'c.id = b.country_id')
      .orderBy('c.name')
      .addOrderBy('b.name')
      .getRawMany();
  }

  async publicForBranch(branchId: string) {
    const [branch, options] = await Promise.all([
      this.branchRepo.findOneBy({
        id: branchId,
        isActive: true,
      }),
      this.carOptionRepo.find({
        where: { branchId, isActive: true },
        order: { category: 'ASC', name: 'ASC' },
      }),
    ]);
    return branch ? options.map(response) : [];
  }

  async adminForBranch(branchId: string) {
    const options = await this.carOptionRepo.find({
      where: { branchId },
      order: { isActive: 'DESC', name: 'ASC' },
    });
    return options.map(response);
  }

  async timeline(input: OptionTimelineQueryDto) {
    const branch = await this.branchRepo.findOneBy({ id: input.branchId });
    if (!branch) throw new NotFoundException('Branch not found');
    const branchNow = DateTime.utc().setZone(branch.timezone);
    if (!branchNow.isValid)
      throw new BadRequestException('Branch timezone is invalid');
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
    const options = await this.carOptionRepo
      .createQueryBuilder('co')
      .select([
        'co.id AS id',
        'co.name AS name',
        'co.category AS category',
        'co.quantity_stock AS "quantityStock"',
        'co.is_active AS "isActive"',
      ])
      .where('co.branch_id = :branchId AND co.quantity_stock IS NOT NULL', {
        branchId: branch.id,
      })
      .orderBy('co.name', 'ASC')
      .getRawMany<{
        id: string;
        name: string;
        category: string;
        quantityStock: number;
        isActive: boolean;
      }>();
    const optionIds = options.map((option) => option.id);
    const reservationRows = optionIds.length
      ? await this.bookingOptionRepo
          .createQueryBuilder('bo')
          .select([
            'bo.car_option_id AS "optionId"',
            'bo.quantity AS quantity',
            'b.pickup_at AS "pickupAt"',
            'COALESCE(b.actual_return_at, b.return_at) AS "returnAt"',
            'b.status AS status',
          ])
          .innerJoin('booking', 'b', 'b.id = bo.booking_id')
          .where('bo.car_option_id IN (:...optionIds)', { optionIds })
          .andWhere("b.status IN ('PENDING','APPROVED','IN_USE')")
          .andWhere('b.pickup_at < :monthEnd', {
            monthEnd: monthEnd.toUTC().toISO(),
          })
          .andWhere('COALESCE(b.actual_return_at, b.return_at) > :monthStart', {
            monthStart: monthStart.toUTC().toISO(),
          })
          .getRawMany<{
            optionId: string;
            quantity: number;
            pickupAt: Date;
            returnAt: Date;
            status: string;
          }>()
      : [];
    const reservationsByOption = new Map<string, typeof reservationRows>();
    for (const reservation of reservationRows) {
      const reservations = reservationsByOption.get(reservation.optionId) ?? [];
      reservations.push(reservation);
      reservationsByOption.set(reservation.optionId, reservations);
    }

    return {
      branch: { id: branch.id, name: branch.name, timezone: branch.timezone },
      month,
      daysCount: monthStart.daysInMonth,
      options: options.map((option) => {
        const reservations = reservationsByOption.get(option.id) ?? [];
        const intervals = reservations.map((reservation) => ({
          startsAt: new Date(String(reservation.pickupAt)).toISOString(),
          endsAt: new Date(String(reservation.returnAt)).toISOString(),
          quantity: Number(reservation.quantity),
          status: reservation.status,
        }));
        return {
          ...option,
          quantityStock: Number(option.quantityStock),
          days: Array.from({ length: monthStart.daysInMonth }, (_, index) => {
            const dayStart = monthStart.plus({ days: index }).startOf('day');
            const requestedInterval = {
              startsAt: dayStart.toUTC().toISO()!,
              endsAt: dayStart.plus({ days: 1 }).toUTC().toISO()!,
            };
            const availability = calculateAvailableQuantity({
              requestedInterval,
              capacity: Number(option.quantityStock),
              reservedIntervals: intervals,
            });
            const pending = calculateAvailableQuantity({
              requestedInterval,
              capacity: Number(option.quantityStock),
              reservedIntervals: intervals
                .filter((interval) => interval.status === 'PENDING')
                .map(({ startsAt, endsAt, quantity }) => ({
                  startsAt,
                  endsAt,
                  quantity,
                })),
            }).peakReserved;
            return {
              day: index + 1,
              date: dayStart.toISODate(),
              totalStock: Number(option.quantityStock),
              peakReserved: availability.peakReserved,
              peakPending: pending,
              available: availability.availableQuantity,
              status:
                availability.availableQuantity > 2
                  ? 'HEALTHY'
                  : availability.availableQuantity > 0
                    ? 'LOW'
                    : 'FULL',
            };
          }),
        };
      }),
    };
  }

  async timelineDetails(input: OptionTimelineDetailQueryDto) {
    const option = await this.carOptionRepo.findOneBy({ id: input.optionId });
    if (!option) throw new NotFoundException('Option not found');
    if (option.quantityStock === null)
      throw new BadRequestException('Option does not track stock quantity');
    const branch = await this.branchRepo.findOneBy({ id: option.branchId });
    if (!branch) throw new NotFoundException('Branch not found');
    const dayStart = DateTime.fromFormat(input.date, 'yyyy-MM-dd', {
      zone: branch.timezone,
    }).startOf('day');
    const branchNow = DateTime.utc().setZone(branch.timezone);
    if (
      !dayStart.isValid ||
      dayStart.toISODate() !== input.date ||
      !branchNow.isValid
    )
      throw new BadRequestException('Date must be a valid branch-local date');
    if (input.date < branchNow.toISODate())
      throw new BadRequestException('Past dates are not available');
    const dayInterval = {
      startsAt: dayStart.toUTC().toISO()!,
      endsAt: dayStart.plus({ days: 1 }).toUTC().toISO()!,
    };
    const rows = await this.bookingOptionRepo
      .createQueryBuilder('bo')
      .select([
        'bo.quantity AS quantity',
        'b.booking_number AS "bookingNumber"',
        'b.status AS status',
        'b.pickup_at AS "pickupAt"',
        'b.return_at AS "returnAt"',
        'b.actual_return_at AS "actualReturnAt"',
      ])
      .innerJoin('booking', 'b', 'b.id = bo.booking_id')
      .where('bo.car_option_id = :optionId', { optionId: option.id })
      .andWhere("b.status IN ('PENDING','APPROVED','IN_USE')")
      .andWhere('b.pickup_at < :dayEnd', { dayEnd: dayInterval.endsAt })
      .andWhere('COALESCE(b.actual_return_at, b.return_at) > :dayStart', {
        dayStart: dayInterval.startsAt,
      })
      .orderBy('b.pickup_at', 'ASC')
      .getRawMany<{
        quantity: number;
        bookingNumber: string;
        status: string;
        pickupAt: Date;
        returnAt: Date;
        actualReturnAt: Date | null;
      }>();
    const intervals = rows.map((row) => ({
      startsAt: new Date(String(row.pickupAt)).toISOString(),
      endsAt: new Date(String(row.actualReturnAt ?? row.returnAt)).toISOString(),
      quantity: Number(row.quantity),
    }));
    const availability = calculateAvailableQuantity({
      requestedInterval: dayInterval,
      capacity: option.quantityStock,
      reservedIntervals: intervals,
    });
    const pending = calculateAvailableQuantity({
      requestedInterval: dayInterval,
      capacity: option.quantityStock,
      reservedIntervals: intervals.filter((_, index) => rows[index].status === 'PENDING'),
    }).peakReserved;
    return {
      branch: { id: branch.id, name: branch.name, timezone: branch.timezone },
      date: input.date,
      option: {
        id: option.id,
        name: option.name,
        category: option.category,
        isActive: option.isActive,
        quantityStock: option.quantityStock,
        peakReserved: availability.peakReserved,
        peakPending: pending,
        available: availability.availableQuantity,
        bookings: rows.map((row) => ({
          bookingNumber: row.bookingNumber,
          status: row.status,
          quantity: Number(row.quantity),
          pickupAt: new Date(String(row.pickupAt)).toISOString(),
          returnAt: new Date(String(row.returnAt)).toISOString(),
          actualReturnAt: row.actualReturnAt
            ? new Date(String(row.actualReturnAt)).toISOString()
            : null,
        })),
      },
    };
  }

  async create(input: CreateOptionDto) {
    try {
      const branch = await this.branchRepo.findOneBy({ id: input.branchId });
      if (!branch) throw new NotFoundException('Branch not found');
      const option = await this.carOptionRepo.save(
        this.carOptionRepo.create({
          id: randomUUID(),
          branchId: input.branchId,
          code: input.code,
          name: input.name,
          description: input.description ?? '',
          category: input.category,
          pricingType: input.pricingType,
          price: input.price,
          quantityStock: input.quantityStock ?? null,
        }),
      );
      return response(option);
    } catch (error) {
      this.mapConstraintError(error);
    }
  }

  async update(optionId: string, input: UpdateOptionDto) {
    if (input.pricingType !== undefined)
      throw new BadRequestException(
        'Create a new option to change pricing type',
      );
    try {
      const option = await this.carOptionRepo.findOneBy({ id: optionId });
      if (!option) throw new NotFoundException('Option not found');
      Object.assign(option, {
        code: input.code ?? option.code,
        name: input.name ?? option.name,
        description: input.description ?? option.description,
        category: input.category ?? option.category,
        price: input.price ?? option.price,
        isActive: input.isActive ?? option.isActive,
        quantityStock:
          input.quantityStock !== undefined
            ? input.quantityStock
            : option.quantityStock,
      });
      return response(await this.carOptionRepo.save(option));
    } catch (error) {
      this.mapConstraintError(error);
    }
  }

  async delete(optionId: string) {
    const option = await this.carOptionRepo.findOneBy({ id: optionId });
    if (!option) throw new NotFoundException('Option not found');

    const activeBooking = await this.carOptionRepo.manager
      .createQueryBuilder()
      .select(['b.booking_number AS "bookingNumber"'])
      .from('booking_option', 'bo')
      .innerJoin('booking', 'b', 'b.id = bo.booking_id')
      .where(
        "bo.car_option_id = :optionId AND b.status IN ('IN_USE', 'CONFIRMED')",
        { optionId },
      )
      .getRawOne<{ bookingNumber: string }>();

    if (activeBooking) {
      throw new BadRequestException(
        `Cannot delete option "${option.name}" because it is reserved in active booking #${activeBooking.bookingNumber}. Deactivate it instead.`,
      );
    }

    await this.carOptionRepo.delete(optionId);
    return { id: optionId, deleted: true };
  }

  private mapConstraintError(error: unknown): never {
    if (typeof error === 'object' && error !== null) {
      const driverError = Reflect.get(error, 'driverError');
      const code = Reflect.get(driverError ?? error, 'code');
      if (code === '23505')
        throw new ConflictException(
          'Option code already exists for this branch',
        );
      if (code === '23503')
        throw new BadRequestException('Branch does not exist');
      if (code === '23514' || code === '22003')
        throw new BadRequestException(
          'Option value is outside the allowed range',
        );
    }
    throw error;
  }
}
