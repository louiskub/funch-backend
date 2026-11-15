import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import type {
  CarDto,
  CarTypeDto,
  OfferDto,
  UpdateCarDto,
  UpdateCarTypeDto,
  UpdateOfferDto,
} from './dto/admin-fleet.dto';

const fields = {
  brand: 'brand',
  model: 'model',
  seats: 'seats',
  transmission: 'transmission',
  fuelType: 'fuel_type',
  features: 'features',
  isActive: 'is_active',
  baseDailyRate: 'base_daily_rate',
  baseHourlyRate: 'base_hourly_rate',
  currencyCode: 'currency_code',
  carTypeBranchId: 'car_type_branch_id',
  vin: 'vin',
  licensePlate: 'license_plate',
  year: 'year',
  buyDate: 'buy_date',
  status: 'status',
} as const;

@Injectable()
export class AdminFleetService {
  constructor(private readonly dataSource: DataSource) {}

  async branches() {
    return this.dataSource
      .createQueryBuilder()
      .select([
        'b.id AS id',
        'b.code AS code',
        'b.name AS name',
        'b.city AS city',
        'b.is_active AS "isActive"',
        'c.code AS "countryCode"',
        'c.currency_code AS "currencyCode"',
      ])
      .from('branch', 'b')
      .innerJoin('country', 'c', 'c.id = b.country_id')
      .orderBy('c.name')
      .addOrderBy('b.name')
      .getRawMany();
  }

  async carTypes() {
    return this.dataSource
      .createQueryBuilder()
      .select([
        't.id AS id',
        't.brand AS brand',
        't.model AS model',
        't.seats AS seats',
        't.transmission AS transmission',
        't.fuel_type AS "fuelType"',
        't.features AS features',
        't.image_file_ids AS "imageFileIds"',
        't.is_active AS "isActive"',
      ])
      .from('car_type', 't')
      .orderBy('t.brand')
      .addOrderBy('t.model')
      .getRawMany();
  }

  async createCarType(input: CarTypeDto) {
    return this.insert(
      'car_type',
      {
        id: randomUUID(),
        brand: input.brand.trim(),
        model: input.model.trim(),
        seats: input.seats,
        transmission: input.transmission,
        fuel_type: input.fuelType,
        features: input.features,
      },
      'id, brand, model, seats, transmission, fuel_type AS "fuelType", features, is_active AS "isActive"',
    );
  }

  async updateCarType(id: string, input: UpdateCarTypeDto) {
    return this.update(
      'car_type',
      id,
      input,
      fields,
      'id, brand, model, seats, transmission, fuel_type AS "fuelType", features, is_active AS "isActive"',
    );
  }

  async offers() {
    return this.dataSource
      .createQueryBuilder()
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
        'o.is_active AS "isActive"',
      ])
      .from('car_type_branch', 'o')
      .innerJoin('car_type', 't', 't.id = o.car_type_id')
      .innerJoin('branch', 'b', 'b.id = o.branch_id')
      .orderBy('b.name')
      .addOrderBy('t.brand')
      .addOrderBy('t.model')
      .getRawMany();
  }

  async createOffer(input: OfferDto) {
    return this.insert(
      'car_type_branch',
      {
        id: randomUUID(),
        car_type_id: input.carTypeId,
        branch_id: input.branchId,
        base_daily_rate: input.baseDailyRate,
        base_hourly_rate: input.baseHourlyRate,
        currency_code: input.currencyCode,
      },
      'id, car_type_id AS "carTypeId", branch_id AS "branchId", base_daily_rate::text AS "baseDailyRate", base_hourly_rate::text AS "baseHourlyRate", currency_code AS "currencyCode", is_active AS "isActive"',
    );
  }

  async updateOffer(id: string, input: UpdateOfferDto) {
    return this.update(
      'car_type_branch',
      id,
      input,
      fields,
      'id, car_type_id AS "carTypeId", branch_id AS "branchId", base_daily_rate::text AS "baseDailyRate", base_hourly_rate::text AS "baseHourlyRate", currency_code AS "currencyCode", is_active AS "isActive"',
    );
  }

  async cars() {
    return this.dataSource
      .createQueryBuilder()
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
      ])
      .from('car', 'c')
      .innerJoin('car_type_branch', 'o', 'o.id = c.car_type_branch_id')
      .innerJoin('car_type', 't', 't.id = o.car_type_id')
      .innerJoin('branch', 'b', 'b.id = o.branch_id')
      .orderBy('b.name')
      .addOrderBy('t.brand')
      .addOrderBy('t.model')
      .addOrderBy('c.license_plate')
      .getRawMany();
  }

  async createCar(input: CarDto) {
    return this.insert(
      'car',
      {
        id: randomUUID(),
        car_type_branch_id: input.carTypeBranchId,
        vin: input.vin.trim(),
        license_plate: input.licensePlate.trim(),
        year: input.year,
        buy_date: input.buyDate ?? null,
        status: input.status,
      },
      'id, car_type_branch_id AS "carTypeBranchId", vin, license_plate AS "licensePlate", year, buy_date::text AS "buyDate", status',
    );
  }

  async updateCar(id: string, input: UpdateCarDto) {
    return this.update(
      'car',
      id,
      input,
      fields,
      'id, car_type_branch_id AS "carTypeBranchId", vin, license_plate AS "licensePlate", year, buy_date::text AS "buyDate", status',
    );
  }

  private async insert(
    table: string,
    values: Record<string, unknown>,
    returning: string,
  ) {
    try {
      const result = await this.dataSource
        .createQueryBuilder()
        .insert()
        .into(table)
        .values(values)
        .returning(returning)
        .execute();
      return result.raw[0] as Record<string, unknown>;
    } catch (error) {
      this.translate(error);
    }
  }

  private async update(
    table: 'car_type' | 'car_type_branch' | 'car',
    id: string,
    input: object,
    columns: typeof fields,
    returning: string,
  ) {
    const entries: [string, unknown][] = [];
    for (const key in input) {
      if (Object.hasOwn(input, key))
        entries.push([key, Reflect.get(input, key)]);
    }
    const filtered = entries.filter(
      ([key, value]) => key in columns && value !== undefined,
    );
    if (!filtered.length)
      throw new BadRequestException('Provide at least one field to update');
    const values = Object.fromEntries(
      filtered.map(([key, value]) => [
        columns[key as keyof typeof columns],
        value,
      ]),
    );
    if (table === 'car_type' && filtered.some(([key]) => key !== 'isActive'))
      Object.assign(values, { updated_at: () => 'now()' });
    try {
      const result = await this.dataSource
        .createQueryBuilder()
        .update(table)
        .set(values)
        .where('id = :id', { id })
        .returning(returning)
        .execute();
      if (!result.raw[0]) throw new NotFoundException('Record not found');
      return result.raw[0] as Record<string, unknown>;
    } catch (error) {
      this.translate(error);
    }
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
