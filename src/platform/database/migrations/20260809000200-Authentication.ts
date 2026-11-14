import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Authentication20260809000200 implements MigrationInterface {
  name = 'Authentication20260809000200';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('app_user')) return;
    await queryRunner.query(`CREATE TABLE app_user (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email = lower(btrim(email))),
  password_hash text NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  role text NOT NULL CHECK (role IN ('CUSTOMER', 'ADMIN')),
  is_suspended boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_session (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_session_user_id_idx ON user_session(user_id);`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS user_session; DROP TABLE IF EXISTS app_user;`,
    );
  }
}
