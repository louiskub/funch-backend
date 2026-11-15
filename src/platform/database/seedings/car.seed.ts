import type { EntityManager } from 'typeorm';
import { Car } from '../../../modules/admin-fleet/entities/car.entity';
import { CarStatus } from '../../../modules/admin-fleet/enums/car-status.enum';
import { offers, seedId } from './seed-data';
import { insertMissing } from './insert-missing';

export async function seedCars(manager: EntityManager): Promise<void> {
  const carsToSeed: {
    id: string;
    carTypeBranchId: string;
    vin: string;
    licensePlate: string;
    year: number;
    status: CarStatus;
  }[] = [];

  let carIndex = 1;
  for (let i = 0; i < offers.length; i++) {
    const offer = offers[i];
    // Seed 8 cars for offer 1, 7 for offer 2 to demonstrate 6/page pagination
    const count = i === 0 ? 8 : i === 1 ? 7 : 1;
    for (let c = 0; c < count; c++) {
      carsToSeed.push({
        id: seedId(5, carIndex),
        carTypeBranchId: offer.id,
        vin: `FUNCH-DEMO-${String(carIndex).padStart(3, '0')}`,
        licensePlate: `FUNCH${String(carIndex).padStart(3, '0')}`,
        year: 2024 + (carIndex % 2),
        status: c === 3 ? CarStatus.MAINTENANCE : CarStatus.ACTIVE,
      });
      carIndex++;
    }
  }

  await insertMissing(manager.getRepository(Car), carsToSeed);
}
