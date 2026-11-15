import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCurrencyConstraint1794776964136 implements MigrationInterface {
  name = 'AddCurrencyConstraint1794776964136';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "currency" ("code", "name", "minor_units") VALUES
        ('AED', 'UAE Dirham', 2),
        ('AUD', 'Australian Dollar', 2),
        ('CAD', 'Canadian Dollar', 2),
        ('GBP', 'Pound Sterling', 2),
        ('JPY', 'Japanese Yen', 0),
        ('KRW', 'South Korean Won', 0),
        ('MYR', 'Malaysian Ringgit', 2),
        ('SGD', 'Singapore Dollar', 2),
        ('THB', 'Baht', 2),
        ('USD', 'US Dollar', 2)
      ON CONFLICT ("code") DO NOTHING
    `);
    await queryRunner.query(
      `ALTER TABLE "country" ADD CONSTRAINT "country_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currency"("code") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "car_type_branch" ADD CONSTRAINT "car_type_branch_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currency"("code") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking" ADD CONSTRAINT "booking_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currency"("code") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch" ADD CONSTRAINT "branch_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "country"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "car_type_branch" ADD CONSTRAINT "car_type_branch_car_type_id_fkey" FOREIGN KEY ("car_type_id") REFERENCES "car_type"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "car_type_branch" ADD CONSTRAINT "car_type_branch_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "car" ADD CONSTRAINT "car_car_type_branch_id_fkey" FOREIGN KEY ("car_type_branch_id") REFERENCES "car_type_branch"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "car" DROP CONSTRAINT "car_car_type_branch_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "car_type_branch" DROP CONSTRAINT "car_type_branch_branch_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "car_type_branch" DROP CONSTRAINT "car_type_branch_car_type_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch" DROP CONSTRAINT "branch_country_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking" DROP CONSTRAINT "booking_currency_code_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "car_type_branch" DROP CONSTRAINT "car_type_branch_currency_code_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "country" DROP CONSTRAINT "country_currency_code_fkey"`,
    );
  }
}
