import type { EntityManager } from 'typeorm';
import { CarType } from '../../../modules/admin-fleet/entities/car-type.entity';
import { carTypes } from './seed-data';
import { insertMissing } from './insert-missing';

export async function seedCarTypes(manager: EntityManager): Promise<void> {
  await insertMissing(
    manager.getRepository(CarType),
    carTypes.map((carType) => ({
      id: carType.id,
      brand: carType.brand,
      model: carType.model,
      seats: carType.seats,
      transmission: carType.transmission,
      fuelType: carType.fuelType,
      features: [...carType.features],
      imageFileIds: [],
    })),
  );
}
