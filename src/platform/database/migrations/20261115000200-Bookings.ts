import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Bookings20261115000200 implements MigrationInterface {
  name = 'Bookings20261115000200';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE booking (
  id uuid PRIMARY KEY,
  booking_number text NOT NULL UNIQUE,
  checkout_key uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES app_user(id),
  car_type_branch_id uuid NOT NULL REFERENCES car_type_branch(id),
  car_id uuid REFERENCES car(id),
  pickup_branch_id uuid NOT NULL REFERENCES branch(id),
  return_branch_id uuid NOT NULL REFERENCES branch(id),
  pickup_at timestamptz NOT NULL,
  return_at timestamptz NOT NULL,
  actual_return_at timestamptz,
  status text NOT NULL CHECK (status IN ('PENDING','APPROVED','REJECTED','IN_USE','COMPLETED','CANCELLED')),
  currency_code char(3) NOT NULL REFERENCES currency(code),
  daily_rate_at_booking numeric(14,4) NOT NULL,
  hourly_rate_at_booking numeric(14,4) NOT NULL,
  charged_days integer NOT NULL CHECK (charged_days >= 0),
  charged_hours integer NOT NULL CHECK (charged_hours >= 0),
  rental_subtotal numeric(14,4) NOT NULL CHECK (rental_subtotal >= 0),
  options_subtotal numeric(14,4) NOT NULL CHECK (options_subtotal >= 0),
  total_amount numeric(14,4) NOT NULL CHECK (total_amount >= 0),
  approved_by uuid REFERENCES app_user(id),
  approved_at timestamptz,
  rejection_reason text,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (return_at > pickup_at),
  CHECK (pickup_branch_id = return_branch_id)
);
CREATE INDEX booking_user_created_idx ON booking(user_id, created_at DESC);
CREATE INDEX booking_capacity_idx ON booking(car_type_branch_id, status, pickup_at, return_at);
CREATE TABLE booking_option (
  id uuid PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES booking(id) ON DELETE CASCADE,
  car_option_id uuid NOT NULL REFERENCES car_option(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_at_booking numeric(14,4) NOT NULL CHECK (unit_price_at_booking >= 0),
  charged_units integer NOT NULL CHECK (charged_units > 0),
  total_amount numeric(14,4) NOT NULL CHECK (total_amount >= 0),
  UNIQUE (booking_id, car_option_id)
);
CREATE TABLE additional_charge (
  id uuid PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES booking(id),
  booking_option_id uuid REFERENCES booking_option(id),
  type text NOT NULL CHECK (type IN ('EXTRA_RENTAL','EXTRA_OPTION','FUEL','DAMAGE','OTHER')),
  description text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(14,4) NOT NULL CHECK (unit_price >= 0),
  amount numeric(14,4) NOT NULL CHECK (amount >= 0),
  status text NOT NULL CHECK (status IN ('PENDING','CONFIRMED','WAIVED')),
  created_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((type = 'EXTRA_OPTION' AND booking_option_id IS NOT NULL) OR (type <> 'EXTRA_OPTION' AND booking_option_id IS NULL))
);
CREATE INDEX additional_charge_booking_idx ON additional_charge(booking_id, status);
CREATE UNIQUE INDEX additional_charge_extra_rental_once_idx ON additional_charge(booking_id) WHERE type='EXTRA_RENTAL';
CREATE UNIQUE INDEX additional_charge_extra_option_once_idx ON additional_charge(booking_option_id) WHERE type='EXTRA_OPTION';`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE IF EXISTS additional_charge; DROP TABLE IF EXISTS booking_option; DROP TABLE IF EXISTS booking;',
    );
  }
}
