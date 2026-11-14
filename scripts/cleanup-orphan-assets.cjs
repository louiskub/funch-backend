const { Client: MinioClient } = require('minio');
const {
  AppDataSource,
} = require('../dist/platform/database/typeorm-data-source.js');

const endpoint = new URL(
  process.env.MINIO_ENDPOINT ?? 'http://localhost:19000',
);
const minio = new MinioClient({
  endPoint: endpoint.hostname,
  port: Number(endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80)),
  useSSL: endpoint.protocol === 'https:',
  accessKey: process.env.MINIO_ACCESS_KEY ?? 'funch-app',
  secretKey: process.env.MINIO_SECRET_KEY ?? 'funch-local-secret-change-this',
});
const bucket = process.env.MINIO_BUCKET ?? 'funch-assets';
const olderThan = Date.now() - 24 * 60 * 60 * 1000;
const assetKey =
  /^(public|private)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/i;

async function cleanOrphans({ db, client, bucketName, cutoff }) {
  const result = await db.query('SELECT object_key FROM file_asset');
  const rows = Array.isArray(result) ? result : result.rows;
  const known = new Set(rows.map((row) => row.object_key));
  const orphanKeys = [];
  await new Promise((resolve, reject) => {
    const stream = client.listObjects(bucketName, '', true);
    stream.on('data', (object) => {
      if (
        object.name &&
        assetKey.test(object.name) &&
        object.lastModified &&
        object.lastModified.getTime() < cutoff &&
        !known.has(object.name)
      )
        orphanKeys.push(object.name);
    });
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  for (const key of orphanKeys) await client.removeObject(bucketName, key);
  return orphanKeys;
}

async function main() {
  await AppDataSource.initialize();
  try {
    const removed = await cleanOrphans({
      db: AppDataSource,
      client: minio,
      bucketName: bucket,
      cutoff: olderThan,
    });
    for (const key of removed) process.stdout.write(`Removed orphan ${key}\n`);
    process.stdout.write(
      `Removed ${removed.length} orphan object(s); objects younger than 24 hours were kept.\n`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module)
  main().catch((error) => {
    process.stderr.write(`Orphan cleanup failed: ${error.message}\n`);
    process.exitCode = 1;
  });
module.exports = { cleanOrphans };
