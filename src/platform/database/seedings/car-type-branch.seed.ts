import type { EntityManager } from 'typeorm';
import { CarTypeBranch } from '../../../modules/admin-fleet/entities/car-type-branch.entity';
import { offers } from './seed-data';
import { insertMissing } from './insert-missing';

export async function seedCarTypeBranches(
  manager: EntityManager,
): Promise<void> {
  await insertMissing(
    manager.getRepository(CarTypeBranch),
    offers.map((offer) => ({
      id: offer.id,
      carTypeId: offer.carTypeId,
      branchId: offer.branchId,
      baseDailyRate: offer.dailyRate,
      baseHourlyRate: offer.hourlyRate,
      currencyCode: offer.currency,
    })),
  );
}
