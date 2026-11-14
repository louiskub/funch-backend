import { AppDataSource } from '../src/platform/database/typeorm-data-source';
import { seedMain } from '../src/platform/database/seedings/main.seeding';

async function seed() {
  await AppDataSource.initialize();
  try {
    await seedMain(AppDataSource);
  } finally {
    await AppDataSource.destroy();
  }
}

void seed().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
