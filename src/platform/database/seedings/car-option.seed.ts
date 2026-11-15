import type { EntityManager } from 'typeorm';
import { CarOption } from '../../../modules/options/entities/car-option.entity';
import { CarOptionCategory } from '../../../modules/options/enums/car-option-category.enum';
import { CarOptionPricingType } from '../../../modules/options/enums/car-option-pricing-type.enum';
import { branches, countries, seedId } from './seed-data';
import { insertMissing } from './insert-missing';

const prices: Record<string, [string, string]> = {
  THB: ['100.00', '50.00'],
  USD: ['5.00', '3.00'],
  JPY: ['500.00', '300.00'],
  SGD: ['5.00', '3.00'],
  MYR: ['15.00', '8.00'],
  KRW: ['5000.00', '3000.00'],
  AUD: ['10.00', '6.00'],
  GBP: ['5.00', '3.00'],
  CAD: ['7.00', '4.00'],
  AED: ['20.00', '10.00'],
};

export async function seedCarOptions(manager: EntityManager): Promise<void> {
  const options = branches.map((branch) => {
    const currency = countries.find(
      (country) => country.code === branch.country,
    )!.currency;
    const [seatPrice] = prices[currency];
    return {
      id: seedId(7, branches.indexOf(branch) + 1),
      branchId: branch.id,
      code: `DEMO-SEAT-${branch.code}`,
      name: 'Child seat',
      description: 'Child seat rental, subject to branch stock',
      category: CarOptionCategory.EQUIPMENT,
      pricingType: CarOptionPricingType.PER_UNIT_PER_DAY,
      price: seatPrice,
      quantityStock: 3,
    };
  });
  const gpsOptions = branches.map((branch, index) => {
    const currency = countries.find(
      (country) => country.code === branch.country,
    )!.currency;
    const [, gpsPrice] = prices[currency];
    return {
      id: seedId(7, branches.length + index + 1),
      branchId: branch.id,
      code: `DEMO-GPS-${branch.code}`,
      name: 'GPS navigation',
      description: 'Portable GPS navigation device',
      category: CarOptionCategory.EQUIPMENT,
      pricingType: CarOptionPricingType.PER_DAY,
      price: gpsPrice,
      quantityStock: 5,
    };
  });
  const optionRows = [...options, ...gpsOptions];

  await insertMissing(manager.getRepository(CarOption), optionRows);
}
