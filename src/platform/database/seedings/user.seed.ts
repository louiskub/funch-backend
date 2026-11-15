import { PasswordService } from '../../../modules/auth/services/password.service';
import { In, type EntityManager } from 'typeorm';
import { AppUser } from '../../../modules/auth/entities/app-user.entity';
import { UserRole } from '../../../modules/auth/enums/user-role.enum';
import { seedId } from './seed-data';

export const seedUsers = async (manager: EntityManager): Promise<void> => {
  const password = new PasswordService();
  const users = [
    {
      id: seedId(6, 1),
      email: 'demo-customer@example.test',
      name: 'Demo Customer',
      phone: '+66123456789',
      role: UserRole.CUSTOMER,
    },
    {
      id: seedId(6, 2),
      email: 'demo-admin@example.test',
      name: 'Demo Administrator',
      phone: '+66123456780',
      role: UserRole.ADMIN,
    },
    {
      id: seedId(6, 3),
      email: 'demo-customer-2@example.test',
      name: 'Demo Customer Two',
      phone: '+66123456781',
      role: UserRole.CUSTOMER,
    },
  ];
  const repository = manager.getRepository(AppUser);
  const existing = await repository.find({
    select: { id: true },
    where: { id: In(users.map(({ id }) => id)) },
    withDeleted: true,
  });
  const existingIds = new Set(existing.map(({ id }) => id));
  const missingUsers = users.filter(({ id }) => !existingIds.has(id));
  if (!missingUsers.length) return;

  await repository.insert(
    await Promise.all(
      missingUsers.map(async (user) => ({
        ...user,
        passwordHash: await password.hash('FunchDemo2026!'),
        isSuspended: false,
      })),
    ),
  );
};
