import type { EntityManager } from 'typeorm';
import { In } from 'typeorm';
import { Currency } from '../../../modules/catalog/entities/currency.entity';
import { currencies } from './seed-data';

export async function seedCurrencies(manager: EntityManager): Promise<void> {
  const repository = manager.getRepository(Currency);
  const codes = currencies.map((c) => c.code);
  const existing = await repository.find({
    select: ['code'],
    where: { code: In(codes) },
    withDeleted: true,
  });
  const existingCodes = new Set(existing.map((c) => c.code.trim()));
  const missing = currencies.filter((c) => !existingCodes.has(c.code));
  if (missing.length) {
    await repository.insert(
      missing.map((c) => ({
        code: c.code,
        name: c.name,
        minorUnits: c.minorUnits,
      })),
    );
  }
}
