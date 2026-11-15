import type { EntityManager } from 'typeorm';
import { Car } from '../../../modules/admin-fleet/entities/car.entity';
import { CarStatus } from '../../../modules/admin-fleet/enums/car-status.enum';
import { offers, seedId } from './seed-data';
import { insertMissing } from './insert-missing';

export async function seedCars(manager: EntityManager): Promise<void> {
  await insertMissing(
    manager.getRepository(Car),
    offers.map((offer, index) => ({
      id: seedId(5, index + 1),
      carTypeBranchId: offer.id,
      vin: `FUNCH-DEMO-${String(index + 1).padStart(3, '0')}`,
      licensePlate: `FUNCH${String(index + 1).padStart(3, '0')}`,
      year: 2025,
      status: CarStatus.ACTIVE,
    })),
  );
}
