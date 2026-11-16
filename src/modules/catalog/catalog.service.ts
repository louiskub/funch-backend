import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CarTypeBranch } from '../admin-fleet/entities/car-type-branch.entity';
import { Branch } from './entities/branch.entity';
import { Country } from './entities/country.entity';
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
    @InjectRepository(CarTypeBranch)
    private readonly offerRepo: Repository<CarTypeBranch>,
    @InjectRepository(Country)
    private readonly countryRepo: Repository<Country>,
    @InjectRepository(Branch)
    private readonly branchRepo: Repository<Branch>,
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
    return this.offerRepo
      .createQueryBuilder('o')
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
        'o.supported_option_ids AS "supportedOptionIds"',
        'b.name AS "branchName"',
        'b.city AS city',
        'b.timezone AS timezone',
        'c.code AS "countryCode"',
      ])
      .innerJoin('branch', 'b', 'b.id = o.branch_id AND b.is_active')
      .innerJoin('country', 'c', 'c.id = b.country_id')
      .innerJoin('car_type', 't', 't.id = o.car_type_id AND t.is_active');
  }

  async countries() {
    return this.countryRepo
      .createQueryBuilder('c')
      .select([
        'c.id AS id',
        'c.code AS code',
        'c.name AS name',
        'c.currency_code AS "currencyCode"',
        'c.driving_side AS "drivingSide"',
      ])
      .distinct(true)
      .innerJoin('branch', 'b', 'b.country_id = c.id AND b.is_active')
      .innerJoin('car_type_branch', 'o', 'o.branch_id = b.id AND o.is_active')
      .innerJoin('car_type', 't', 't.id = o.car_type_id AND t.is_active')
      .orderBy('c.name')
      .getRawMany();
  }

  async branches(countryCode: string) {
    return this.branchRepo
      .createQueryBuilder('b')
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
      .innerJoin('country', 'c', 'c.id = b.country_id')
      .innerJoin('car_type_branch', 'o', 'o.branch_id = b.id AND o.is_active')
      .innerJoin('car_type', 't', 't.id = o.car_type_id AND t.is_active')
      .where('b.is_active AND upper(c.code) = upper(:countryCode)', {
        countryCode,
      })
      .orderBy('b.name')
      .getRawMany();
  }

  async offers(
    branchId: string,
    options: {
      page?: string;
      pageSize?: string;
      category?: string;
      sortBy?: string;
    } = {},
  ) {
    const page = Math.max(1, Math.floor(Number(options.page) || 1));
    const pageSize = Math.min(
      100,
      Math.max(1, Math.floor(Number(options.pageSize) || 10)),
    );
    const query = this.offerQuery().where(
      'o.branch_id = :branchId AND o.is_active',
      { branchId },
    );
    const vehicleName = "LOWER(t.brand || ' ' || t.model)";
    const isSuv = `(${vehicleName} LIKE '%suv%' OR t.features::text ILIKE '%suv%')`;
    if (options.category === 'SUV') query.andWhere(isSuv);
    if (options.category === 'Van')
      query.andWhere(
        `(${vehicleName} LIKE '%van%' OR ${vehicleName} LIKE '%commuter%' OR t.seats > 5)`,
      );
    if (options.category === 'Sedan')
      query.andWhere(`NOT ${isSuv} AND t.seats <= 5`);

    const categoryRows = this.offerRepo
      .createQueryBuilder('o')
      .select([
        't.brand AS brand',
        't.model AS model',
        't.seats AS seats',
        't.features AS features',
      ])
      .innerJoin('car_type', 't', 't.id = o.car_type_id AND t.is_active')
      .where('o.branch_id = :branchId AND o.is_active', { branchId })
      .getRawMany<{
        brand: string;
        model: string;
        seats: number;
        features: string[];
      }>();
    const orderBy = options.sortBy;
    if (orderBy === 'price-asc') query.orderBy('o.base_daily_rate', 'ASC');
    else if (orderBy === 'price-desc')
      query.orderBy('o.base_daily_rate', 'DESC');
    else if (orderBy === 'name') query.orderBy('t.brand', 'ASC');
    else query.orderBy('t.brand', 'ASC');
    query.addOrderBy('t.model', 'ASC').addOrderBy('o.id', 'ASC');

    const [totalRow, rows, categories] = await Promise.all([
      query
        .clone()
        .select('COUNT(DISTINCT o.id)', 'total')
        .orderBy()
        .getRawOne<{ total: string }>(),
      query
        .offset((page - 1) * pageSize)
        .limit(pageSize)
        .getRawMany<CatalogOfferRow>(),
      categoryRows,
    ]);
    const availableCategories = new Set<string>();
    for (const offer of categories) {
      const name = `${offer.brand} ${offer.model}`.toLowerCase();
      const features = offer.features.join(' ').toLowerCase();
      if (name.includes('suv') || features.includes('suv'))
        availableCategories.add('SUV');
      else if (
        name.includes('van') ||
        name.includes('commuter') ||
        offer.seats > 5
      )
        availableCategories.add('Van');
      else availableCategories.add('Sedan');
    }
    return {
      items: this.withImages(rows),
      page,
      pageSize,
      total: Number(totalRow?.total ?? 0),
      categories: [...availableCategories],
    };
  }

  async offer(offerId: string) {
    const rows = await this.offerQuery()
      .where('o.id = :offerId AND o.is_active', { offerId })
      .getRawMany<CatalogOfferRow>();
    return rows[0] ? this.withImages(rows)[0] : null;
  }
}
