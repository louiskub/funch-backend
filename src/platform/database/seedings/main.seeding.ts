import type { DataSource } from 'typeorm';
import { seedBranches } from './branch.seed';
import { seedCars } from './car.seed';
import { seedCarOptions } from './car-option.seed';
import { seedCarTypeBranches } from './car-type-branch.seed';
import { seedCarTypes } from './car-type.seed';
import { seedCountries } from './country.seed';
import { seedBookings } from './booking.seed';
import { seedUsers } from './user.seed';

export async function seedMain(dataSource: DataSource): Promise<void> {
  await dataSource.transaction(async (manager) => {
    await seedCountries(manager);
    await seedBranches(manager);
    await seedCarTypes(manager);
    await seedCarTypeBranches(manager);
    await seedCars(manager);
    await seedCarOptions(manager);
    await seedUsers(manager);
    await seedBookings(manager);
  });
}
