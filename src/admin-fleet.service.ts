import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from './database.service';
import type {
  CarDto,
  CarTypeDto,
  OfferDto,
  UpdateCarDto,
  UpdateCarTypeDto,
  UpdateOfferDto,
} from './admin-fleet.dto';

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
  constructor(private readonly db: DatabaseService) {}

  async branches() {
    return (
      await this.db.query(
        `SELECT b.id, b.code, b.name, b.city, b.is_active AS "isActive", c.code AS "countryCode", c.currency_code AS "currencyCode"
       FROM branch b JOIN country c ON c.id = b.country_id ORDER BY c.name, b.name`,
      )
    ).rows;
  }

  async carTypes() {
    return (
      await this.db.query(
        `SELECT id, brand, model, seats, transmission, fuel_type AS "fuelType", features, is_active AS "isActive"
       FROM car_type ORDER BY brand, model`,
      )
    ).rows;
  }

  async createCarType(input: CarTypeDto) {
    return this.insert(
      `INSERT INTO car_type (id, brand, model, seats, transmission, fuel_type, features)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, brand, model, seats, transmission,
       fuel_type AS "fuelType", features, is_active AS "isActive"`,
      [
        randomUUID(),
        input.brand.trim(),
        input.model.trim(),
        input.seats,
        input.transmission,
        input.fuelType,
        input.features,
      ],
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
    return (
      await this.db.query(
        `SELECT o.id, o.car_type_id AS "carTypeId", t.brand, t.model, o.branch_id AS "branchId",
       b.name AS "branchName", b.city, o.base_daily_rate::text AS "baseDailyRate",
       o.base_hourly_rate::text AS "baseHourlyRate", o.currency_code AS "currencyCode",
       o.is_active AS "isActive" FROM car_type_branch o JOIN car_type t ON t.id=o.car_type_id
       JOIN branch b ON b.id=o.branch_id ORDER BY b.name, t.brand, t.model`,
      )
    ).rows;
  }

  async createOffer(input: OfferDto) {
    return this.insert(
      `INSERT INTO car_type_branch (id, car_type_id, branch_id, base_daily_rate, base_hourly_rate, currency_code)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, car_type_id AS "carTypeId", branch_id AS "branchId",
       base_daily_rate::text AS "baseDailyRate", base_hourly_rate::text AS "baseHourlyRate", currency_code AS "currencyCode", is_active AS "isActive"`,
      [
        randomUUID(),
        input.carTypeId,
        input.branchId,
        input.baseDailyRate,
        input.baseHourlyRate,
        input.currencyCode,
      ],
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
    return (
      await this.db.query(
        `SELECT c.id, c.car_type_branch_id AS "carTypeBranchId", t.brand, t.model, b.name AS "branchName",
       c.vin, c.license_plate AS "licensePlate", c.year, c.buy_date::text AS "buyDate", c.status
       FROM car c JOIN car_type_branch o ON o.id=c.car_type_branch_id JOIN car_type t ON t.id=o.car_type_id
       JOIN branch b ON b.id=o.branch_id ORDER BY b.name, t.brand, t.model, c.license_plate`,
      )
    ).rows;
  }

  async createCar(input: CarDto) {
    return this.insert(
      `INSERT INTO car (id, car_type_branch_id, vin, license_plate, year, buy_date, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, car_type_branch_id AS "carTypeBranchId", vin,
       license_plate AS "licensePlate", year, buy_date::text AS "buyDate", status`,
      [
        randomUUID(),
        input.carTypeBranchId,
        input.vin.trim(),
        input.licensePlate.trim(),
        input.year,
        input.buyDate ?? null,
        input.status,
      ],
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

  private async insert(sql: string, values: unknown[]) {
    try {
      return (await this.db.query(sql, values)).rows[0];
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
    const assignments = filtered.map(
      ([key], index) =>
        `${columns[key as keyof typeof columns]} = $${index + 1}`,
    );
    if (table === 'car_type' && filtered.some(([key]) => key !== 'isActive'))
      assignments.push('updated_at = now()');
    try {
      const { rows } = await this.db.query<
        QueryResultRow & Record<string, unknown>
      >(
        `UPDATE ${table} SET ${assignments.join(', ')} WHERE id = $${filtered.length + 1} RETURNING ${returning}`,
        [...filtered.map(([, value]) => value), id],
      );
      if (!rows[0]) throw new NotFoundException('Record not found');
      return rows[0];
    } catch (error) {
      this.translate(error);
    }
  }

  private translate(error: unknown): never {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      const code: unknown = error.code;
      if (code === '23505')
        throw new ConflictException(
          'A record with this unique value already exists',
        );
      if (code === '23503')
        throw new BadRequestException(
          'The selected car type, branch, or offer does not exist',
        );
      if (code === '23514' || code === '22P02' || code === '22003')
        throw new BadRequestException(
          'The submitted values are outside allowed ranges',
        );
    }
    throw error;
  }
}
