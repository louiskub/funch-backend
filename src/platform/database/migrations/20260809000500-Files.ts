import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Files20260809000500 implements MigrationInterface {
  name = 'Files20260809000500';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('file_asset')) return;
    await queryRunner.query(`CREATE TABLE file_asset (
  id uuid PRIMARY KEY,
  object_key text NOT NULL UNIQUE,
  original_name text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  visibility text NOT NULL CHECK (visibility IN ('PUBLIC', 'PRIVATE')),
  uploaded_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((visibility = 'PUBLIC' AND object_key LIKE 'public/%') OR (visibility = 'PRIVATE' AND object_key LIKE 'private/%'))
);
CREATE INDEX file_asset_uploaded_by_idx ON file_asset(uploaded_by);`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS file_asset;`);
  }
}
