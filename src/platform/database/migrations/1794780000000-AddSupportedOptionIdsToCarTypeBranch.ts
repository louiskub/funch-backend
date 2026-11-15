import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSupportedOptionIdsToCarTypeBranch1794780000000 implements MigrationInterface {
  name = 'AddSupportedOptionIdsToCarTypeBranch1794780000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "car_type_branch" ADD COLUMN "supported_option_ids" uuid array NOT NULL DEFAULT '{}'`,
    );
    // Initialize existing offers with all existing options for their respective branches
    await queryRunner.query(`
      UPDATE "car_type_branch" o
      SET "supported_option_ids" = COALESCE(
        (SELECT array_agg(co.id) FROM "car_option" co WHERE co.branch_id = o.branch_id),
        '{}'::uuid[]
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "car_type_branch" DROP COLUMN "supported_option_ids"`,
    );
  }
}
