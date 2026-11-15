import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1794770096587 implements MigrationInterface {
  name = 'InitialSchema1794770096587';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "currency" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "code" character(3) NOT NULL, "name" text NOT NULL, "minor_units" smallint NOT NULL, CONSTRAINT "currency_minor_units_check" CHECK (minor_units BETWEEN 0 AND 4), CONSTRAINT "currency_name_check" CHECK (length(btrim(name)) > 0), CONSTRAINT "currency_code_check" CHECK (code ~ '^[A-Z]{3}$'), CONSTRAINT "PK_723472e41cae44beb0763f4039c" PRIMARY KEY ("code"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."app_user_role_enum" AS ENUM('CUSTOMER', 'ADMIN')`,
    );
    await queryRunner.query(
      `CREATE TABLE "app_user" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" text NOT NULL, "password_hash" text NOT NULL, "name" text NOT NULL, "phone" text NOT NULL, "role" "public"."app_user_role_enum" NOT NULL DEFAULT 'CUSTOMER', "is_suspended" boolean NOT NULL DEFAULT false, CONSTRAINT "UQ_3fa909d0e37c531ebc237703391" UNIQUE ("email"), CONSTRAINT "PK_22a5c4a3d9b2fb8e4e73fc4ada1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "user_session" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "token_hash" character(64) NOT NULL, "user_id" uuid NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_9ccf6d901cef4067214284f327e" PRIMARY KEY ("token_hash"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."booking_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'IN_USE', 'COMPLETED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "booking" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "booking_number" text NOT NULL, "checkout_key" uuid NOT NULL, "user_id" uuid NOT NULL, "car_type_branch_id" uuid NOT NULL, "car_id" uuid, "pickup_branch_id" uuid NOT NULL, "return_branch_id" uuid NOT NULL, "pickup_at" TIMESTAMP WITH TIME ZONE NOT NULL, "return_at" TIMESTAMP WITH TIME ZONE NOT NULL, "actual_return_at" TIMESTAMP WITH TIME ZONE, "status" "public"."booking_status_enum" NOT NULL DEFAULT 'PENDING', "currency_code" character(3) NOT NULL, "daily_rate_at_booking" numeric(14,4) NOT NULL, "hourly_rate_at_booking" numeric(14,4) NOT NULL, "charged_days" integer NOT NULL, "charged_hours" integer NOT NULL, "rental_subtotal" numeric(14,4) NOT NULL, "options_subtotal" numeric(14,4) NOT NULL, "total_amount" numeric(14,4) NOT NULL, "approved_by" uuid, "approved_at" TIMESTAMP WITH TIME ZONE, "rejection_reason" text, "cancellation_reason" text, CONSTRAINT "UQ_41b53a9402bb1ff8fbcb39b186f" UNIQUE ("booking_number"), CONSTRAINT "UQ_48ba44689dee7aaf16558d724b2" UNIQUE ("checkout_key"), CONSTRAINT "booking_interval_check" CHECK (return_at > pickup_at), CONSTRAINT "PK_49171efc69702ed84c812f33540" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "booking_car_status_idx" ON "booking" ("car_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "booking_capacity_idx" ON "booking" ("car_type_branch_id", "status", "pickup_at", "return_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "booking_user_created_idx" ON "booking" ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "booking_option" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "booking_id" uuid NOT NULL, "car_option_id" uuid NOT NULL, "quantity" integer NOT NULL, "unit_price_at_booking" numeric(14,4) NOT NULL, "charged_units" integer NOT NULL, "total_amount" numeric(14,4) NOT NULL, CONSTRAINT "UQ_5fc2b9cd1b3334f0fb4ffb9f947" UNIQUE ("booking_id", "car_option_id"), CONSTRAINT "booking_option_total_check" CHECK (total_amount >= 0), CONSTRAINT "booking_option_charged_units_check" CHECK (charged_units > 0), CONSTRAINT "booking_option_unit_price_check" CHECK (unit_price_at_booking >= 0), CONSTRAINT "booking_option_quantity_check" CHECK (quantity > 0), CONSTRAINT "PK_2a634c9fc53d23259280c107a92" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."additional_charge_type_enum" AS ENUM('EXTRA_RENTAL', 'EXTRA_OPTION', 'FUEL', 'DAMAGE', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "additional_charge" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "booking_id" uuid NOT NULL, "booking_option_id" uuid, "type" "public"."additional_charge_type_enum" NOT NULL, "description" text NOT NULL, "quantity" integer NOT NULL, "unit_price" numeric(14,4) NOT NULL, "amount" numeric(14,4) NOT NULL, "status" text NOT NULL, "created_by" uuid NOT NULL, CONSTRAINT "additional_charge_option_check" CHECK ((type = 'EXTRA_OPTION' AND booking_option_id IS NOT NULL) OR (type <> 'EXTRA_OPTION' AND booking_option_id IS NULL)), CONSTRAINT "PK_a7386b9e68d04744ffd4e83869e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "additional_charge_extra_option_once_idx" ON "additional_charge" ("booking_option_id") WHERE type='EXTRA_OPTION'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "additional_charge_extra_rental_once_idx" ON "additional_charge" ("booking_id") WHERE type='EXTRA_RENTAL'`,
    );
    await queryRunner.query(
      `CREATE INDEX "additional_charge_booking_idx" ON "additional_charge" ("booking_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "branch" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "country_id" uuid NOT NULL, "type" text NOT NULL, "code" text NOT NULL, "airport_code" character(3), "name" text NOT NULL, "city" text NOT NULL, "state" text, "address" text NOT NULL, "timezone" text NOT NULL, "latitude" numeric(9,6) NOT NULL, "longitude" numeric(9,6) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_638479fc29fab932b7ab0aea912" UNIQUE ("code"), CONSTRAINT "PK_2e39f426e2faefdaa93c5961976" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "branch_country_active_name_idx" ON "branch" ("country_id", "is_active", "name") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."country_driving_side_enum" AS ENUM('LEFT', 'RIGHT')`,
    );
    await queryRunner.query(
      `CREATE TABLE "country" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character(2) NOT NULL, "name" text NOT NULL, "currency_code" character(3) NOT NULL, "driving_side" "public"."country_driving_side_enum" NOT NULL, CONSTRAINT "UQ_8ff4c23dc9a3f3856555bd86186" UNIQUE ("code"), CONSTRAINT "PK_bf6e37c231c4f4ea56dcd887269" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."car_type_transmission_enum" AS ENUM('AUTO', 'MANUAL')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."car_type_fuel_type_enum" AS ENUM('GASOLINE', 'DIESEL', 'ELECTRIC', 'HYBRID')`,
    );
    await queryRunner.query(
      `CREATE TABLE "car_type" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "brand" text NOT NULL, "model" text NOT NULL, "seats" integer NOT NULL, "transmission" "public"."car_type_transmission_enum" NOT NULL, "fuel_type" "public"."car_type_fuel_type_enum" NOT NULL, "features" text array NOT NULL DEFAULT '{}', "image_file_ids" uuid array NOT NULL DEFAULT '{}', "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_e42013b63237e078783155c64fd" UNIQUE ("brand", "model"), CONSTRAINT "car_type_seats_check" CHECK (seats > 0), CONSTRAINT "PK_7bfbb82e6b89e82079a62290ff6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "car_type_branch" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "car_type_id" uuid NOT NULL, "branch_id" uuid NOT NULL, "base_daily_rate" numeric(14,4) NOT NULL, "base_hourly_rate" numeric(14,4) NOT NULL, "currency_code" character(3) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_b20c5375b5fae6e3ecee5154233" UNIQUE ("car_type_id", "branch_id"), CONSTRAINT "PK_865902c845c4650e4d31ffab497" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "car_type_branch_branch_active_type_idx" ON "car_type_branch" ("branch_id", "is_active", "car_type_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."car_status_enum" AS ENUM('ACTIVE', 'MAINTENANCE', 'DECOMMISSIONED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "car" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "car_type_branch_id" uuid NOT NULL, "vin" text NOT NULL, "license_plate" text NOT NULL, "year" integer NOT NULL, "buy_date" date, "status" "public"."car_status_enum" NOT NULL DEFAULT 'ACTIVE', "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_e917bf949f80860e817b74006e8" UNIQUE ("vin"), CONSTRAINT "UQ_b2b6edbd78c20fecd6a6f6bca4c" UNIQUE ("license_plate"), CONSTRAINT "PK_55bbdeb14e0b1d7ab417d11ee6d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "car_offer_active_plate_idx" ON "car" ("car_type_branch_id", "is_active", "license_plate") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."car_option_category_enum" AS ENUM('EQUIPMENT', 'SERVICE', 'PROTECTION')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."car_option_pricing_type_enum" AS ENUM('PER_DAY', 'PER_UNIT_PER_DAY', 'FIXED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "car_option" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "branch_id" uuid NOT NULL, "code" character varying(40) NOT NULL, "name" character varying(120) NOT NULL, "description" text NOT NULL DEFAULT '', "category" "public"."car_option_category_enum" NOT NULL, "pricing_type" "public"."car_option_pricing_type_enum" NOT NULL, "price" numeric(14,4) NOT NULL, "quantity_stock" integer, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_c543f724ed29a24f73f8bbf40e9" UNIQUE ("branch_id", "code"), CONSTRAINT "car_option_stock_check" CHECK (quantity_stock IS NULL OR quantity_stock >= 0), CONSTRAINT "car_option_price_check" CHECK (price >= 0), CONSTRAINT "PK_0a5b66aca4928bb87ffac6fe192" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "car_option_branch_active_category_name_idx" ON "car_option" ("branch_id", "is_active", "category", "name") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."file_asset_visibility_enum" AS ENUM('PUBLIC', 'PRIVATE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "file_asset" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "object_key" text NOT NULL, "original_name" text NOT NULL, "mime_type" text NOT NULL, "size_bytes" bigint NOT NULL, "visibility" "public"."file_asset_visibility_enum" NOT NULL DEFAULT 'PUBLIC', "uploaded_by" uuid NOT NULL, CONSTRAINT "UQ_f976202385cc68ba1736387890f" UNIQUE ("object_key"), CONSTRAINT "file_asset_size_check" CHECK (size_bytes > 0), CONSTRAINT "PK_4cc6688b434b7f95a9788fa5f4c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "file_asset_uploaded_by_idx" ON "file_asset" ("uploaded_by") `,
    );
    await queryRunner.query(
      `ALTER TABLE "user_session" ADD CONSTRAINT "FK_13275383dcdf095ee29f2b3455a" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_session" DROP CONSTRAINT "FK_13275383dcdf095ee29f2b3455a"`,
    );
    await queryRunner.query(`DROP INDEX "public"."file_asset_uploaded_by_idx"`);
    await queryRunner.query(`DROP TABLE "file_asset"`);
    await queryRunner.query(`DROP TYPE "public"."file_asset_visibility_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."car_option_branch_active_category_name_idx"`,
    );
    await queryRunner.query(`DROP TABLE "car_option"`);
    await queryRunner.query(
      `DROP TYPE "public"."car_option_pricing_type_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."car_option_category_enum"`);
    await queryRunner.query(`DROP INDEX "public"."car_offer_active_plate_idx"`);
    await queryRunner.query(`DROP TABLE "car"`);
    await queryRunner.query(`DROP TYPE "public"."car_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."car_type_branch_branch_active_type_idx"`,
    );
    await queryRunner.query(`DROP TABLE "car_type_branch"`);
    await queryRunner.query(`DROP TABLE "car_type"`);
    await queryRunner.query(`DROP TYPE "public"."car_type_fuel_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."car_type_transmission_enum"`);
    await queryRunner.query(`DROP TABLE "country"`);
    await queryRunner.query(`DROP TYPE "public"."country_driving_side_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."branch_country_active_name_idx"`,
    );
    await queryRunner.query(`DROP TABLE "branch"`);
    await queryRunner.query(
      `DROP INDEX "public"."additional_charge_booking_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."additional_charge_extra_rental_once_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."additional_charge_extra_option_once_idx"`,
    );
    await queryRunner.query(`DROP TABLE "additional_charge"`);
    await queryRunner.query(`DROP TYPE "public"."additional_charge_type_enum"`);
    await queryRunner.query(`DROP TABLE "booking_option"`);
    await queryRunner.query(`DROP INDEX "public"."booking_user_created_idx"`);
    await queryRunner.query(`DROP INDEX "public"."booking_capacity_idx"`);
    await queryRunner.query(`DROP INDEX "public"."booking_car_status_idx"`);
    await queryRunner.query(`DROP TABLE "booking"`);
    await queryRunner.query(`DROP TYPE "public"."booking_status_enum"`);
    await queryRunner.query(`DROP TABLE "user_session"`);
    await queryRunner.query(`DROP TABLE "app_user"`);
    await queryRunner.query(`DROP TYPE "public"."app_user_role_enum"`);
    await queryRunner.query(`DROP TABLE "currency"`);
  }
}
