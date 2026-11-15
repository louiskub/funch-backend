import type { EntityManager } from 'typeorm';
import { Country } from '../../../modules/catalog/entities/country.entity';
import { countries } from './seed-data';
import { insertMissing } from './insert-missing';

export async function seedCountries(manager: EntityManager): Promise<void> {
  await insertMissing(
    manager.getRepository(Country),
    countries.map((country) => ({
      id: country.id,
      code: country.code,
      name: country.name,
      currencyCode: country.currency,
      drivingSide: country.drivingSide,
    })),
  );
}
