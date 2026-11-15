import type { EntityManager } from 'typeorm';
import { Branch } from '../../../modules/catalog/entities/branch.entity';
import { branches, countries } from './seed-data';
import { insertMissing } from './insert-missing';

export async function seedBranches(manager: EntityManager): Promise<void> {
  await insertMissing(
    manager.getRepository(Branch),
    branches.map((branch) => ({
      id: branch.id,
      countryId: countries.find((country) => country.code === branch.country)!
        .id,
      type: 'AIRPORT',
      code: branch.code,
      airportCode: branch.airport,
      name: branch.name,
      city: branch.city,
      state: branch.state,
      address: branch.address,
      timezone: branch.timezone,
      latitude: String(branch.latitude),
      longitude: String(branch.longitude),
    })),
  );
}
