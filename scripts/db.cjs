const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Client } = require('pg');

async function run() {
  const action = process.argv[2];
  if (!['migrate', 'seed', 'setup'].includes(action)) {
    throw new Error('Usage: node scripts/db.cjs migrate|seed|setup');
  }
  const client = new Client({
    connectionString:
      process.env.DATABASE_URL ?? 'postgres://car-rental:car-rental@localhost:15432/car-rental',
  });
  await client.connect();
  try {
    if (action === 'migrate' || action === 'setup') {
      await client.query(
        'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
      );
      const migrationsDir = join(__dirname, '../db/migrations');
      for (const name of readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort()) {
        const applied = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
        if (applied.rowCount) continue;
        await client.query('BEGIN');
        try {
          await client.query(readFileSync(join(migrationsDir, name), 'utf8'));
          await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
    }
    if (action === 'seed' || action === 'setup') {
      await client.query(readFileSync(join(__dirname, '../db/seed.sql'), 'utf8'));
    }
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
