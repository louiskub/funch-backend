import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Options20260809000400 implements MigrationInterface {
  name = 'Options20260809000400';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('car_option')) return;
    await queryRunner.query(`CREATE TABLE car_option (
  id uuid PRIMARY KEY,
  branch_id uuid NOT NULL REFERENCES branch(id),
  code text NOT NULL CHECK (length(code) BETWEEN 1 AND 40),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '',
  category text NOT NULL CHECK (category IN ('EQUIPMENT', 'SERVICE', 'PROTECTION')),
  pricing_type text NOT NULL CHECK (pricing_type IN ('PER_DAY', 'PER_UNIT_PER_DAY', 'FIXED')),
  price numeric(14,4) NOT NULL CHECK (price >= 0),
  quantity_stock integer CHECK (quantity_stock >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, code)
);`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS car_option;`);
  }
}
