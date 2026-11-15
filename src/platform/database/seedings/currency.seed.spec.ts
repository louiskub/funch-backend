import type { EntityManager, Repository } from 'typeorm';
import { Currency } from '../../../modules/catalog/entities/currency.entity';
import { seedCurrencies } from './currency.seed';
import { currencies } from './seed-data';

describe('seedCurrencies', () => {
  it('inserts missing currencies and is idempotent', async () => {
    const existing = [{ code: 'THB', name: 'Baht', minorUnits: 2 }];
    const find = jest.fn(() => Promise.resolve(existing as Currency[]));
    const insert = jest.fn(() =>
      Promise.resolve({ identifiers: [], generatedMaps: [], raw: [] }),
    );

    const repo = { find, insert } as unknown as Repository<Currency>;
    const manager = {
      getRepository: jest.fn(() => repo),
    } as unknown as EntityManager;

    await seedCurrencies(manager);

    expect(find).toHaveBeenCalled();
    expect(insert).toHaveBeenCalledTimes(1);

    const inserted = (insert.mock.calls[0] as [Partial<Currency>[]])[0];
    expect(inserted).toHaveLength(currencies.length - 1);
    expect(inserted.some((c) => c.code === 'THB')).toBe(false);
    expect(inserted.some((c) => c.code === 'USD')).toBe(true);
  });
});
