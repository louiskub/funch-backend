import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateOptionDto, UpdateOptionDto } from './dto/options.dto';

type OptionRecord = Record<string, unknown> & {
  id: string;
  branchId: string;
  code: string;
  name: string;
  description: string;
  category: string;
  pricingType: string;
  price: string;
  quantityStock: number | null;
  isActive: boolean;
};
const selection = `o.id, o.branch_id AS "branchId", o.code, o.name, o.description, o.category,
  o.pricing_type AS "pricingType", o.price::text AS price, o.quantity_stock AS "quantityStock", o.is_active AS "isActive"`;
const returning = `id, branch_id AS "branchId", code, name, description, category,
  pricing_type AS "pricingType", price::text AS price, quantity_stock AS "quantityStock", is_active AS "isActive"`;

@Injectable()
export class OptionsService {
  constructor(private readonly dataSource: DataSource) {}

  async branches() {
    return this.dataSource
      .createQueryBuilder()
      .select([
        'b.id AS id',
        'b.name AS name',
        'b.city AS city',
        'c.code AS "countryCode"',
      ])
      .from('branch', 'b')
      .innerJoin('country', 'c', 'c.id = b.country_id')
      .orderBy('c.name')
      .addOrderBy('b.name')
      .getRawMany();
  }

  async publicForBranch(branchId: string) {
    return this.dataSource
      .createQueryBuilder()
      .select(selection)
      .from('car_option', 'o')
      .innerJoin('branch', 'b', 'b.id = o.branch_id AND b.is_active')
      .where('o.branch_id = :branchId AND o.is_active', { branchId })
      .orderBy('o.category')
      .addOrderBy('o.name')
      .getRawMany();
  }

  async adminForBranch(branchId: string) {
    return this.dataSource
      .createQueryBuilder()
      .select(selection)
      .from('car_option', 'o')
      .where('o.branch_id = :branchId', { branchId })
      .orderBy('o.is_active', 'DESC')
      .addOrderBy('o.name')
      .getRawMany();
  }

  async create(input: CreateOptionDto) {
    try {
      const branch = await this.dataSource
        .createQueryBuilder()
        .select('b.id')
        .from('branch', 'b')
        .where('b.id = :branchId', { branchId: input.branchId })
        .getRawOne();
      if (!branch) throw new NotFoundException('Branch not found');
      const result = await this.dataSource
        .createQueryBuilder()
        .insert()
        .into('car_option')
        .values({
          id: () => 'gen_random_uuid()',
          branch_id: input.branchId,
          code: input.code,
          name: input.name,
          description: input.description ?? '',
          category: input.category,
          pricing_type: input.pricingType,
          price: input.price,
          quantity_stock: input.quantityStock ?? null,
        })
        .returning(returning)
        .execute();
      return result.raw[0] as OptionRecord;
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
      const values = Object.fromEntries(
        Object.entries({
          code: input.code,
          name: input.name,
          description: input.description,
          category: input.category,
          price: input.price,
          is_active: input.isActive,
        }).filter(([, value]) => value !== undefined && value !== null),
      );
      if (input.quantityStock !== undefined)
        Object.assign(values, { quantity_stock: input.quantityStock });
      Object.assign(values, { updated_at: () => 'now()' });
      const result = await this.dataSource
        .createQueryBuilder()
        .update('car_option')
        .set(values)
        .where('id = :optionId', { optionId })
        .returning(returning)
        .execute();
      if (!result.raw[0]) throw new NotFoundException('Option not found');
      return result.raw[0] as OptionRecord;
    } catch (error) {
      this.mapConstraintError(error);
    }
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
