import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { AppUser } from '../src/modules/auth/entities/app-user.entity';
import { UserRole } from '../src/modules/auth/enums/user-role.enum';
import { Currency } from '../src/modules/catalog/entities/currency.entity';
import { createAppDataSource } from '../src/platform/database/typeorm-data-source';
import { seedMain } from '../src/platform/database/seedings/main.seeding';

describe('Currency reference data and repeatable catalog seed', () => {
  let db: DataSource;

  beforeAll(async () => {
    const url = process.env.REFERENCE_TEST_DATABASE_URL;
    if (!url || new URL(url).pathname !== '/funch_reference_test')
      throw new Error(
        'REFERENCE_TEST_DATABASE_URL must target the isolated funch_reference_test database',
      );
    process.env.DATABASE_URL = url;
    db = createAppDataSource();
    await db.initialize();
    await db.runMigrations();
    await seedMain(db);
  });

  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  it('maps supported currencies through the Currency entity', async () => {
    expect(
      await db.getRepository(Currency).find({ order: { code: 'ASC' } }),
    ).toEqual([
      { code: 'AED', name: 'UAE Dirham', minorUnits: 2 },
      { code: 'AUD', name: 'Australian Dollar', minorUnits: 2 },
      { code: 'CAD', name: 'Canadian Dollar', minorUnits: 2 },
      { code: 'GBP', name: 'Pound Sterling', minorUnits: 2 },
      { code: 'JPY', name: 'Japanese Yen', minorUnits: 0 },
      { code: 'KRW', name: 'South Korean Won', minorUnits: 0 },
      { code: 'MYR', name: 'Malaysian Ringgit', minorUnits: 2 },
      { code: 'SGD', name: 'Singapore Dollar', minorUnits: 2 },
      { code: 'THB', name: 'Baht', minorUnits: 2 },
      { code: 'USD', name: 'US Dollar', minorUnits: 2 },
    ]);
    await expect(
      db.getRepository(Currency).save({
        code: 'JPY',
        name: 'Japanese Yen',
        minorUnits: -1,
      }),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
  });

  it('enforces currency references for countries and prevents deleting used currencies', async () => {
    await expect(
      db.query("UPDATE country SET currency_code='ZZZ' WHERE code='TH'"),
    ).rejects.toMatchObject({ driverError: { code: '23503' } });
    await expect(
      db.query("DELETE FROM currency WHERE code='THB'"),
    ).rejects.toMatchObject({ driverError: { code: '23503' } });
  });

  it('preserves admin edits, ordered galleries, rates, and car status across seed reruns', async () => {
    const userId = randomUUID();
    const files = [randomUUID(), randomUUID()];
    const typeId = '30000000-0000-4000-8000-000000000001';
    const offerId = '40000000-0000-4000-8000-000000000001';
    const carId = '50000000-0000-4000-8000-000000000001';
    await db.getRepository(AppUser).save({
      id: userId,
      email: `${userId}@example.test`,
      passwordHash: 'not-used-for-authentication',
      name: 'Seed test',
      phone: '+66123456789',
      role: UserRole.ADMIN,
      isSuspended: false,
    });
    try {
      for (const id of files) {
        await db.query(
          `INSERT INTO file_asset (id, object_key, original_name, mime_type, size_bytes, visibility, uploaded_by)
           VALUES ($1, $2, 'seed-test.png', 'image/png', 1, 'PUBLIC', $3)`,
          [id, `public/${id}.png`, userId],
        );
      }
      await db.query(
        "UPDATE country SET name='Edited country' WHERE code='TH'",
      );
      await db.query("UPDATE branch SET is_active=false WHERE code='BKK'");
      await db.query(
        "UPDATE car_type SET model='Edited model', image_file_ids=$2::uuid[], is_active=false WHERE id=$1",
        [typeId, files],
      );
      await db.query(
        'UPDATE car_type_branch SET base_daily_rate=2345.6789, base_hourly_rate=99.4321, is_active=false WHERE id=$1',
        [offerId],
      );
      await db.query(
        "UPDATE car SET status='MAINTENANCE', is_active=false WHERE id=$1",
        [carId],
      );

      await seedMain(db);
      await seedMain(db);

      expect(
        await db.query(
          'SELECT model, image_file_ids, is_active FROM car_type WHERE id=$1',
          [typeId],
        ),
      ).toEqual([
        { model: 'Edited model', image_file_ids: files, is_active: false },
      ]);
      expect(
        await db.query(
          'SELECT base_daily_rate, base_hourly_rate, is_active FROM car_type_branch WHERE id=$1',
          [offerId],
        ),
      ).toEqual([
        {
          base_daily_rate: '2345.6789',
          base_hourly_rate: '99.4321',
          is_active: false,
        },
      ]);
      expect(
        await db.query('SELECT status, is_active FROM car WHERE id=$1', [
          carId,
        ]),
      ).toEqual([{ status: 'MAINTENANCE', is_active: false }]);
      expect(
        await db.query("SELECT name FROM country WHERE code='TH'"),
      ).toEqual([{ name: 'Edited country' }]);
      expect(
        await db.query("SELECT is_active FROM branch WHERE code='BKK'"),
      ).toEqual([{ is_active: false }]);
    } finally {
      await db.query("UPDATE car_type SET image_file_ids='{}' WHERE id=$1", [
        typeId,
      ]);
      await db.query('DELETE FROM file_asset WHERE uploaded_by=$1', [userId]);
      await db.getRepository(AppUser).delete(userId);
    }
  });
});
