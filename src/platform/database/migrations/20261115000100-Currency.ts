import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Currency20261115000100 implements MigrationInterface {
  name = 'Currency20261115000100';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE currency (
      code char(3) PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
      name text NOT NULL CHECK (length(btrim(name)) > 0),
      minor_units smallint NOT NULL CHECK (minor_units BETWEEN 0 AND 4)
    )`);
    await queryRunner.query(`INSERT INTO currency (code, name, minor_units) VALUES
      ('THB', 'Baht', 2),
      ('USD', 'US Dollar', 2)`);
    await queryRunner.query(`ALTER TABLE country
      ADD CONSTRAINT country_currency_code_fkey
      FOREIGN KEY (currency_code) REFERENCES currency(code)`);
    await queryRunner.query(`ALTER TABLE car_type_branch
      ADD CONSTRAINT car_type_branch_currency_code_fkey
      FOREIGN KEY (currency_code) REFERENCES currency(code)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE car_type_branch
      DROP CONSTRAINT car_type_branch_currency_code_fkey`);
    await queryRunner.query(`ALTER TABLE country
      DROP CONSTRAINT country_currency_code_fkey`);
    await queryRunner.query('DROP TABLE currency');
  }
}
