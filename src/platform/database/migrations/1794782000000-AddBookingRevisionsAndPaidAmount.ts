import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBookingRevisionsAndPaidAmount1794782000000 implements MigrationInterface {
  name = 'AddBookingRevisionsAndPaidAmount1794782000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "booking" ADD COLUMN "paid_amount" numeric(14,4)`,
    );
    await queryRunner.query(
      `UPDATE "booking" SET "paid_amount" = "total_amount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking" ALTER COLUMN "paid_amount" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking" ADD CONSTRAINT "booking_paid_amount_check" CHECK ("paid_amount" >= 0)`,
    );

    await queryRunner.query(
      `CREATE TABLE "booking_revision" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "booking_id" uuid NOT NULL,
        "revision_number" integer NOT NULL,
        "changed_by" uuid NOT NULL,
        "before_state" jsonb NOT NULL,
        "after_state" jsonb NOT NULL,
        "amount_delta" numeric(14,4) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "booking_revision_number_unique" UNIQUE ("booking_id", "revision_number"),
        CONSTRAINT "booking_revision_number_check" CHECK ("revision_number" > 0),
        CONSTRAINT "booking_revision_pk" PRIMARY KEY ("id"),
        CONSTRAINT "booking_revision_booking_fk" FOREIGN KEY ("booking_id") REFERENCES "booking"("id") ON DELETE CASCADE,
        CONSTRAINT "booking_revision_changed_by_fk" FOREIGN KEY ("changed_by") REFERENCES "app_user"("id") ON DELETE RESTRICT
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "booking_revision_booking_created_idx" ON "booking_revision" ("booking_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."booking_revision_booking_created_idx"`,
    );
    await queryRunner.query(`DROP TABLE "booking_revision"`);
    await queryRunner.query(
      `ALTER TABLE "booking" DROP CONSTRAINT "booking_paid_amount_check"`,
    );
    await queryRunner.query(`ALTER TABLE "booking" DROP COLUMN "paid_amount"`);
  }
}
