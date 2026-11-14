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

@Injectable()
export class OptionsService {
  constructor(private readonly dataSource: DataSource) {}

  async branches() {
    const rows = await this.dataSource.query<Record<string, unknown>[]>(
      `SELECT b.id, b.name, b.city, c.code AS "countryCode"
       FROM branch b JOIN country c ON c.id = b.country_id ORDER BY c.name, b.name`,
    );
    return rows;
  }

  async publicForBranch(branchId: string) {
    const rows = await this.dataSource.query<Record<string, unknown>[]>(
      `SELECT ${selection} FROM car_option o JOIN branch b ON b.id = o.branch_id AND b.is_active
       WHERE o.branch_id = $1 AND o.is_active ORDER BY o.category, o.name`,
      [branchId],
    );
    return rows;
  }

  async adminForBranch(branchId: string) {
    const rows = await this.dataSource.query<Record<string, unknown>[]>(
      `SELECT ${selection} FROM car_option o WHERE o.branch_id = $1 ORDER BY is_active DESC, name`,
      [branchId],
    );
    return rows;
  }

  async create(input: CreateOptionDto) {
    try {
      const rows = await this.dataSource.query<OptionRecord[]>(
        `INSERT INTO car_option AS o (id, branch_id, code, name, description, category, pricing_type, price, quantity_stock)
         SELECT gen_random_uuid(), b.id, $2, $3, COALESCE($4, ''), $5, $6, $7::numeric, $8
         FROM branch b WHERE b.id = $1 RETURNING ${selection}`,
        [
          input.branchId,
          input.code,
          input.name,
          input.description,
          input.category,
          input.pricingType,
          input.price,
          input.quantityStock ?? null,
        ],
      );
      if (!rows[0]) throw new NotFoundException('Branch not found');
      return rows[0];
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
      const [rows] = await this.dataSource.query<[OptionRecord[], number]>(
        `UPDATE car_option AS o SET code = COALESCE($2, code), name = COALESCE($3, name),
         description = COALESCE($4, description), category = COALESCE($5, category),
         price = COALESCE($6::numeric, price), quantity_stock = CASE WHEN $7 THEN $8::integer ELSE quantity_stock END,
         is_active = COALESCE($9, is_active), updated_at = now()
         WHERE id = $1 RETURNING ${selection}`,
        [
          optionId,
          input.code,
          input.name,
          input.description,
          input.category,
          input.price,
          Object.prototype.hasOwnProperty.call(input, 'quantityStock'),
          input.quantityStock ?? null,
          input.isActive,
        ],
      );
      if (!rows[0]) throw new NotFoundException('Option not found');
      return rows[0];
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
