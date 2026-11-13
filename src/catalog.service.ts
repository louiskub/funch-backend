import { Injectable } from '@nestjs/common';
import { DatabaseService } from './database.service';

@Injectable()
export class CatalogService {
  constructor(private readonly db: DatabaseService) {}

  async countries() {
    const { rows } = await this.db.query(
      `SELECT DISTINCT c.id, c.code, c.name, c.currency_code AS "currencyCode", c.driving_side AS "drivingSide"
       FROM country c
       JOIN branch b ON b.country_id = c.id AND b.is_active
       JOIN car_type_branch o ON o.branch_id = b.id AND o.is_active
       JOIN car_type t ON t.id = o.car_type_id AND t.is_active
       ORDER BY c.name`,
    );
    return rows;
  }

  async branches(countryCode: string) {
    const { rows } = await this.db.query(
      `SELECT DISTINCT b.id, b.code, b.type, b.name, b.city, b.state, b.airport_code AS "airportCode",
              b.address, b.timezone, b.latitude::text AS latitude, b.longitude::text AS longitude,
              c.code AS "countryCode", c.currency_code AS "currencyCode"
       FROM branch b
       JOIN country c ON c.id = b.country_id
       JOIN car_type_branch o ON o.branch_id = b.id AND o.is_active
       JOIN car_type t ON t.id = o.car_type_id AND t.is_active
       WHERE b.is_active AND upper(c.code) = upper($1)
       ORDER BY b.name`,
      [countryCode],
    );
    return rows;
  }

  async offers(branchId: string) {
    const { rows } = await this.db.query(
      `SELECT o.id, t.id AS "carTypeId", t.brand, t.model, t.seats, t.transmission, t.fuel_type AS "fuelType",
              t.features, t.image_file_ids AS "imageFileIds", o.base_hourly_rate::text AS "baseHourlyRate",
              o.base_daily_rate::text AS "baseDailyRate", o.currency_code AS "currencyCode",
              b.name AS "branchName", b.city, b.timezone, c.code AS "countryCode"
       FROM car_type_branch o
       JOIN branch b ON b.id = o.branch_id AND b.is_active
       JOIN country c ON c.id = b.country_id
       JOIN car_type t ON t.id = o.car_type_id AND t.is_active
       WHERE o.branch_id = $1 AND o.is_active
       ORDER BY t.brand, t.model`,
      [branchId],
    );
    return rows;
  }

  async offer(offerId: string) {
    const { rows } = await this.db.query(
      `SELECT o.id, t.id AS "carTypeId", t.brand, t.model, t.seats, t.transmission, t.fuel_type AS "fuelType",
              t.features, t.image_file_ids AS "imageFileIds", o.base_hourly_rate::text AS "baseHourlyRate",
              o.base_daily_rate::text AS "baseDailyRate", o.currency_code AS "currencyCode",
              b.id AS "branchId", b.name AS "branchName", b.city, b.timezone, c.code AS "countryCode"
       FROM car_type_branch o
       JOIN branch b ON b.id = o.branch_id AND b.is_active
       JOIN country c ON c.id = b.country_id
       JOIN car_type t ON t.id = o.car_type_id AND t.is_active
       WHERE o.id = $1 AND o.is_active`,
      [offerId],
    );
    return rows[0] ?? null;
  }
}
