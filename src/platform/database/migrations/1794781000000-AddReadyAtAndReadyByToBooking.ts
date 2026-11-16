import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReadyAtAndReadyByToBooking1794781000000
  implements MigrationInterface
{
  name = 'AddReadyAtAndReadyByToBooking1794781000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "booking" ADD COLUMN "ready_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking" ADD COLUMN "ready_by" uuid`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "booking" DROP COLUMN "ready_by"`);
    await queryRunner.query(`ALTER TABLE "booking" DROP COLUMN "ready_at"`);
  }
}
