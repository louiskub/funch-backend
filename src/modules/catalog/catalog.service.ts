import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StorageService } from '../../platform/storage/storage.service';

type CatalogImageRow = {
  id: string;
  originalName: string;
  mimeType: string;
  objectKey: string;
};
type CatalogOfferRow = { images: CatalogImageRow[] } & Record<string, unknown>;

@Injectable()
export class CatalogService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: StorageService,
  ) {}

  private withImages<T extends { images: CatalogImageRow[] }>(rows: T[]) {
    return rows.map(({ images, ...row }) => ({
      ...row,
      images: images.map(({ objectKey, ...image }) => ({
        ...image,
        url: this.storage.publicUrl(objectKey),
      })),
    }));
  }

  async countries() {
    const rows = await this.dataSource.query<Record<string, unknown>[]>(
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
    const rows = await this.dataSource.query<Record<string, unknown>[]>(
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
    const rows = await this.dataSource.query<CatalogOfferRow[]>(
      `SELECT o.id, o.branch_id AS "branchId", t.id AS "carTypeId", t.brand, t.model, t.seats, t.transmission, t.fuel_type AS "fuelType",
              t.features, COALESCE((SELECT json_agg(json_build_object('id', f.id, 'originalName', f.original_name, 'mimeType', f.mime_type, 'objectKey', f.object_key) ORDER BY r.ordinality)
                FROM unnest(t.image_file_ids) WITH ORDINALITY r(id, ordinality) JOIN file_asset f ON f.id = r.id AND f.visibility = 'PUBLIC'), '[]'::json) AS images,
              o.base_hourly_rate::text AS "baseHourlyRate",
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
    return this.withImages(rows);
  }

  async offer(offerId: string) {
    const rows = await this.dataSource.query<CatalogOfferRow[]>(
      `SELECT o.id, o.branch_id AS "branchId", t.id AS "carTypeId", t.brand, t.model, t.seats, t.transmission, t.fuel_type AS "fuelType",
              t.features, COALESCE((SELECT json_agg(json_build_object('id', f.id, 'originalName', f.original_name, 'mimeType', f.mime_type, 'objectKey', f.object_key) ORDER BY r.ordinality)
                FROM unnest(t.image_file_ids) WITH ORDINALITY r(id, ordinality) JOIN file_asset f ON f.id = r.id AND f.visibility = 'PUBLIC'), '[]'::json) AS images,
              o.base_hourly_rate::text AS "baseHourlyRate",
              o.base_daily_rate::text AS "baseDailyRate", o.currency_code AS "currencyCode",
              b.name AS "branchName", b.city, b.timezone, c.code AS "countryCode"
       FROM car_type_branch o
       JOIN branch b ON b.id = o.branch_id AND b.is_active
       JOIN country c ON c.id = b.country_id
       JOIN car_type t ON t.id = o.car_type_id AND t.is_active
       WHERE o.id = $1 AND o.is_active`,
      [offerId],
    );
    return rows[0] ? this.withImages(rows)[0] : null;
  }
}
