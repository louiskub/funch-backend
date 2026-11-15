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

  private offerQuery() {
    return this.dataSource
      .createQueryBuilder()
      .select([
        'o.id AS id',
        'o.branch_id AS "branchId"',
        't.id AS "carTypeId"',
        't.brand AS brand',
        't.model AS model',
        't.seats AS seats',
        't.transmission AS transmission',
        't.fuel_type AS "fuelType"',
        't.features AS features',
        `COALESCE((SELECT json_agg(json_build_object('id', f.id, 'originalName', f.original_name, 'mimeType', f.mime_type, 'objectKey', f.object_key) ORDER BY r.ordinality)
          FROM unnest(t.image_file_ids) WITH ORDINALITY r(id, ordinality)
          JOIN file_asset f ON f.id = r.id AND f.visibility = 'PUBLIC'), '[]'::json) AS images`,
        'o.base_hourly_rate::text AS "baseHourlyRate"',
        'o.base_daily_rate::text AS "baseDailyRate"',
        'o.currency_code AS "currencyCode"',
        'b.name AS "branchName"',
        'b.city AS city',
        'b.timezone AS timezone',
        'c.code AS "countryCode"',
      ])
      .from('car_type_branch', 'o')
      .innerJoin('branch', 'b', 'b.id = o.branch_id AND b.is_active')
      .innerJoin('country', 'c', 'c.id = b.country_id')
      .innerJoin('car_type', 't', 't.id = o.car_type_id AND t.is_active');
  }

  async countries() {
    return this.dataSource
      .createQueryBuilder()
      .select([
        'c.id AS id',
        'c.code AS code',
        'c.name AS name',
        'c.currency_code AS "currencyCode"',
        'c.driving_side AS "drivingSide"',
      ])
      .distinct(true)
      .from('country', 'c')
      .innerJoin('branch', 'b', 'b.country_id = c.id AND b.is_active')
      .innerJoin('car_type_branch', 'o', 'o.branch_id = b.id AND o.is_active')
      .innerJoin('car_type', 't', 't.id = o.car_type_id AND t.is_active')
      .orderBy('c.name')
      .getRawMany();
  }

  async branches(countryCode: string) {
    return this.dataSource
      .createQueryBuilder()
      .select([
        'b.id AS id',
        'b.code AS code',
        'b.type AS type',
        'b.name AS name',
        'b.city AS city',
        'b.state AS state',
        'b.airport_code AS "airportCode"',
        'b.address AS address',
        'b.timezone AS timezone',
        'b.latitude::text AS latitude',
        'b.longitude::text AS longitude',
        'c.code AS "countryCode"',
        'c.currency_code AS "currencyCode"',
      ])
      .distinct(true)
      .from('branch', 'b')
      .innerJoin('country', 'c', 'c.id = b.country_id')
      .innerJoin('car_type_branch', 'o', 'o.branch_id = b.id AND o.is_active')
      .innerJoin('car_type', 't', 't.id = o.car_type_id AND t.is_active')
      .where('b.is_active AND upper(c.code) = upper(:countryCode)', {
        countryCode,
      })
      .orderBy('b.name')
      .getRawMany();
  }

  async offers(branchId: string) {
    const rows = await this.offerQuery()
      .where('o.branch_id = :branchId AND o.is_active', { branchId })
      .orderBy('t.brand')
      .addOrderBy('t.model')
      .getRawMany<CatalogOfferRow>();
    return this.withImages(rows);
  }

  async offer(offerId: string) {
    const rows = await this.offerQuery()
      .where('o.id = :offerId AND o.is_active', { offerId })
      .getRawMany<CatalogOfferRow>();
    return rows[0] ? this.withImages(rows)[0] : null;
  }
}
