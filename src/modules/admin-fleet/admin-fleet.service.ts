import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Branch } from '../catalog/entities/branch.entity';
import { Car } from './entities/car.entity';
import { CarType } from './entities/car-type.entity';
import { CarTypeBranch } from './entities/car-type-branch.entity';
import type {
  CarDto,
  CarTypeDto,
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
        'c.code AS "countryCode"',
        'c.currency_code AS "currencyCode"',
      ])
      .innerJoin('country', 'c', 'c.id = b.country_id')
      .orderBy('c.name')
      .addOrderBy('b.name')
      .getRawMany();
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
