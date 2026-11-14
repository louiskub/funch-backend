const { randomUUID } = require('node:crypto');
const {
  AppDataSource,
} = require('../dist/platform/database/typeorm-data-source.js');
const { PasswordService } = require('../dist/modules/auth/services/password.service.js');
const { AppUser } = require('../dist/modules/auth/entities/app-user.entity.js');

async function run() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim();
  const phone = process.env.ADMIN_PHONE?.trim();
  if (!email || !password || !name || !phone) {
    throw new Error(
      'Set ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, and ADMIN_PHONE explicitly.',
    );
  }
  if (!email.includes('@') || password.length < 12 || password.length > 128) {
    throw new Error(
      'Admin email must be valid and password must be 12–128 characters.',
    );
  }
  const passwordHash = await new PasswordService().hash(password);
  await AppDataSource.initialize();
  try {
    const users = AppDataSource.getRepository(AppUser);
    const existing = await users.findOneBy({ email });
    await users.save({
      id: existing?.id ?? randomUUID(),
      email,
      passwordHash,
      name,
      phone,
      role: 'ADMIN',
      isSuspended: false,
    });
    process.stdout.write(`Provisioned admin account ${email}.\n`);
  } finally {
    await AppDataSource.destroy();
  }
}

run().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
