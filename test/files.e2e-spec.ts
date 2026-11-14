import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { Client as MinioClient } from 'minio';
import { Pool } from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database.service';
import { FilesService } from '../src/files.service';
import { StorageService } from '../src/storage.service';
import { cleanOrphans } from '../scripts/cleanup-orphan-assets.cjs';

const origin = 'http://localhost:3000';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==',
  'base64',
);

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected object response');
  return Object.fromEntries(Object.entries(value));
}

function string(value: unknown): string {
  if (typeof value !== 'string')
    throw new Error('Expected string response field');
  return value;
}

describe('File assets and car type galleries (real PostgreSQL and MinIO)', () => {
  let app: INestApplication<App>;
  let db: Pool;
  let adminCookie: string;
  let customerCookie: string;
  let adminId: string;
  let typeIds: string[] = [];
  let minio: MinioClient;
  let storage: StorageService;
  let database: DatabaseService;
  const databaseUrl = process.env.FILES_TEST_DATABASE_URL;
  const bucket = process.env.FILES_TEST_BUCKET ?? 'funch-assets-ticket05-test';

  beforeAll(async () => {
    if (
      !databaseUrl ||
      new URL(databaseUrl).pathname !== '/funch_ticket05_test' ||
      bucket !== 'funch-assets-ticket05-test'
    )
      throw new Error(
        'FILES_TEST_DATABASE_URL must target funch_ticket05_test',
      );
    process.env.DATABASE_URL = databaseUrl;
    process.env.MINIO_BUCKET = bucket;
    process.env.MINIO_ENDPOINT = 'http://127.0.0.1:19000';
    process.env.MINIO_PUBLIC_ENDPOINT = 'http://localhost:19000';
    process.env.MINIO_ACCESS_KEY = 'funch-app';
    process.env.MINIO_SECRET_KEY = 'funch-local-secret-change-this';
    db = new Pool({ connectionString: databaseUrl });
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableCors({ origin, credentials: true });
    await app.init();
    storage = app.get(StorageService);
    database = app.get(DatabaseService);
    minio = storage.client;
  });

  beforeEach(async () => {
    const email = `files-admin-${randomUUID()}@example.com`;
    const admin = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({
        name: 'File Admin',
        email,
        password: 'long-enough-test-password',
        phone: '+66123456789',
      })
      .expect(201);
    adminCookie = admin.headers['set-cookie'][0].split(';')[0];
    const adminBody = record(admin.body);
    adminId = string(record(adminBody.user).id);
    await db.query("UPDATE app_user SET role = 'ADMIN' WHERE id = $1", [
      adminId,
    ]);
    const customer = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({
        name: 'File Customer',
        email: `customer-${email}`,
        password: 'long-enough-test-password',
        phone: '+66123456789',
      })
      .expect(201);
    customerCookie = customer.headers['set-cookie'][0].split(';')[0];
    typeIds = [];
  });

  async function createType(name: string) {
    const id = randomUUID();
    typeIds.push(id);
    await db.query(
      "INSERT INTO car_type (id, brand, model, seats, transmission, fuel_type, features) VALUES ($1,$2,$3,4,'AUTO','GASOLINE','{}')",
      [id, `FilesTest-${name}-${randomUUID()}`, name],
    );
    return id;
  }

  async function upload(
    visibility: 'PUBLIC' | 'PRIVATE' = 'PUBLIC',
    filename = `files-test-${randomUUID()}.png`,
    bytes = png,
  ) {
    const response = await request(app.getHttpServer())
      .post(`/api/admin/files?visibility=${visibility}`)
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .attach('file', bytes, { filename, contentType: 'image/png' })
      .expect(201);
    const id = string(record(response.body).id);
    const rows = await db.query<{ object_key: string }>(
      'SELECT object_key FROM file_asset WHERE id = $1',
      [id],
    );
    return { id, key: rows.rows[0].object_key, response };
  }

  afterEach(async () => {
    await db.query(
      'DELETE FROM car_type_branch WHERE car_type_id = ANY($1::uuid[])',
      [typeIds],
    );
    await db.query('DELETE FROM car_type WHERE id = ANY($1::uuid[])', [
      typeIds,
    ]);
    const files = await db.query<{ object_key: string }>(
      'DELETE FROM file_asset WHERE uploaded_by = $1 RETURNING object_key',
      [adminId],
    );
    for (const { object_key } of files.rows)
      await minio.removeObject(bucket, object_key).catch(() => undefined);
    await db.query('DELETE FROM app_user WHERE id = $1', [adminId]);
  });

  afterAll(async () => {
    await app?.close();
    await db?.end();
  });

  it('rejects unauthorized access and truncated or spoofed uploads, then allows only public reads and admin private signing', async () => {
    await request(app.getHttpServer()).get('/api/admin/files').expect(401);
    await request(app.getHttpServer())
      .get('/api/admin/files')
      .set('Cookie', customerCookie)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/admin/files?visibility=PUBLIC')
      .set('Cookie', customerCookie)
      .set('Origin', origin)
      .attach('file', png, 'customer.png')
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/admin/files?visibility=PUBLIC')
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .attach('file', Buffer.from([0xff, 0xd8, 0xff]), {
        filename: 'fake.png',
        contentType: 'image/png',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/admin/files?visibility=PUBLIC')
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1, 1), {
        filename: 'large.png',
        contentType: 'image/png',
      })
      .expect(413);

    const publicFile = await upload();
    const privateFile = await upload('PRIVATE');
    const typeId = await createType('invalid-gallery');
    for (const imageFileIds of [
      [publicFile.id, publicFile.id],
      [privateFile.id],
      [randomUUID()],
    ]) {
      await request(app.getHttpServer())
        .post(`/api/admin/fleet/car-types/${typeId}/images`)
        .set('Cookie', adminCookie)
        .set('Origin', origin)
        .send({ imageFileIds })
        .expect(400);
    }
    expect((await fetch(storage.publicUrl(publicFile.key))).status).toBe(200);
    expect((await fetch(storage.publicUrl(privateFile.key))).status).toBe(403);
    expect((await fetch(`http://localhost:19000/${bucket}/`)).status).toBe(403);
    expect(
      (
        await fetch(
          `http://localhost:19000/${bucket}/public/anonymous-write.png`,
          {
            method: 'PUT',
            body: png,
            headers: { 'Content-Type': 'image/png' },
          },
        )
      ).status,
    ).toBe(403);
    expect(
      (await fetch(storage.publicUrl(publicFile.key), { method: 'DELETE' }))
        .status,
    ).toBe(403);
    await request(app.getHttpServer())
      .get(`/api/admin/files/${privateFile.id}/signed-get`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/admin/files/${privateFile.id}/signed-get`)
      .set('Cookie', customerCookie)
      .expect(403);
    const signed = await request(app.getHttpServer())
      .get(`/api/admin/files/${privateFile.id}/signed-get`)
      .set('Cookie', adminCookie)
      .expect(200)
      .expect('Cache-Control', 'no-store');
    const signedBody = record(signed.body);
    const signedUrl = string(signedBody.url);
    expect(new URL(signedUrl).searchParams.get('X-Amz-Expires')).toBe('300');
    expect((await fetch(signedUrl)).status).toBe(200);
    expect(
      Date.parse(string(signedBody.expiresAt)) - Date.now(),
    ).toBeGreaterThan(295_000);
  });

  it('preserves image order across shared galleries and prevents referenced deletion', async () => {
    const firstType = await createType('one');
    const secondType = await createType('two');
    const first = await upload();
    const second = await upload();
    await request(app.getHttpServer())
      .post(`/api/admin/fleet/car-types/${firstType}/images`)
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send({ imageFileIds: [second.id, first.id] })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/admin/fleet/car-types/${secondType}/images`)
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send({ imageFileIds: [first.id] })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/api/admin/files/${first.id}`)
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .expect(409);
    const order = await db.query<{ image_file_ids: string[] }>(
      'SELECT image_file_ids FROM car_type WHERE id = $1',
      [firstType],
    );
    expect(order.rows[0].image_file_ids).toEqual([second.id, first.id]);
    await request(app.getHttpServer())
      .post(`/api/admin/fleet/car-types/${firstType}/images`)
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send({ imageFileIds: [first.id, second.id] })
      .expect(201);
    const refs = await db.query<{ image_file_ids: string[] }>(
      'SELECT image_file_ids FROM car_type WHERE id = ANY($1::uuid[]) ORDER BY id',
      [[firstType, secondType]],
    );
    expect(refs.rows.some((row) => row.image_file_ids.includes(first.id))).toBe(
      true,
    );
    const offerId = randomUUID();
    await db.query(
      "INSERT INTO car_type_branch (id, car_type_id, branch_id, base_daily_rate, base_hourly_rate, currency_code) VALUES ($1,$2,$3,100,20,'THB')",
      [offerId, firstType, '20000000-0000-4000-8000-000000000001'],
    );
    const offer = await request(app.getHttpServer())
      .get(`/api/offers/${offerId}`)
      .expect(200);
    expect(record(offer.body).images).toMatchObject([
      { id: first.id },
      { id: second.id },
    ]);
    await db.query('DELETE FROM car_type_branch WHERE id = $1', [offerId]);
    await request(app.getHttpServer())
      .post(`/api/admin/fleet/car-types/${firstType}/images`)
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send({ imageFileIds: [second.id] })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/admin/fleet/car-types/${secondType}/images`)
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .send({ imageFileIds: [] })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/api/admin/files/${first.id}`)
      .set('Cookie', adminCookie)
      .set('Origin', origin)
      .expect(200);
  });

  it('serializes attachment against deletion and retries an orphan when immediate cleanup fails', async () => {
    const typeId = await createType('race');
    const file = await upload();
    const [attach, remove] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/admin/fleet/car-types/${typeId}/images`)
        .set('Cookie', adminCookie)
        .set('Origin', origin)
        .send({ imageFileIds: [file.id] }),
      request(app.getHttpServer())
        .delete(`/api/admin/files/${file.id}`)
        .set('Cookie', adminCookie)
        .set('Origin', origin),
    ]);
    expect([201, 400]).toContain(attach.status);
    expect([200, 409]).toContain(remove.status);
    const state = await db.query<{
      image_file_ids: string[];
      object_key: string | null;
    }>(
      'SELECT t.image_file_ids, f.object_key FROM car_type t LEFT JOIN file_asset f ON f.id = $2 WHERE t.id = $1',
      [typeId, file.id],
    );
    if (state.rows[0].image_file_ids.includes(file.id)) {
      expect(state.rows[0].object_key).toBe(file.key);
      await minio.statObject(bucket, file.key);
    }

    const before = new Set<string>();
    for await (const value of minio.listObjects(bucket, 'public/', true)) {
      const item: unknown = value;
      if (
        typeof item === 'object' &&
        item !== null &&
        'name' in item &&
        typeof item.name === 'string'
      )
        before.add(item.name);
    }
    jest
      .spyOn(database, 'query')
      .mockRejectedValueOnce(new Error('simulated database write failure'));
    jest
      .spyOn(storage, 'remove')
      .mockRejectedValueOnce(new Error('simulated cleanup failure'));
    await expect(
      app.get(FilesService).upload(
        {
          fieldname: 'file',
          originalname: `files-test-orphan-${randomUUID()}.png`,
          mimetype: 'image/png',
          encoding: '7bit',
          size: png.length,
          destination: '',
          filename: '',
          path: '',
          buffer: png,
          stream: Readable.from(png),
        } satisfies Express.Multer.File,
        adminId,
        'PUBLIC',
      ),
    ).rejects.toThrow('orphan cleanup');
    jest.restoreAllMocks();
    const newObjects: string[] = [];
    for await (const value of minio.listObjects(bucket, 'public/', true)) {
      const item: unknown = value;
      if (
        typeof item === 'object' &&
        item !== null &&
        'name' in item &&
        typeof item.name === 'string' &&
        !before.has(item.name)
      )
        newObjects.push(item.name);
    }
    expect(newObjects).toHaveLength(1);
    const orphanKey = newObjects[0];
    if (!orphanKey)
      throw new Error('Expected the failed upload object to remain for retry');
    const removed = await cleanOrphans({
      db: {
        query: () =>
          db.query<{ object_key: string }>('SELECT object_key FROM file_asset'),
      },
      client: minio,
      bucketName: bucket,
      cutoff: Date.now() + 1_000,
    });
    expect(removed).toContain(orphanKey);
    await expect(minio.statObject(bucket, orphanKey)).rejects.toBeDefined();
  });
});
