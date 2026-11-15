import type { QueryDeepPartialEntity, Repository } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { insertMissing } from './insert-missing';

class SeedRecord extends BaseEntity {}

function createRepository(existingIds: string[] = []) {
  const storedIds = new Set(existingIds);
  const find = jest.fn(() =>
    Promise.resolve([...storedIds].map((id) => ({ id }) as SeedRecord)),
  );
  const insert = jest.fn((rows: QueryDeepPartialEntity<SeedRecord>[]) => {
    for (const row of rows) {
      if (typeof row.id === 'string') storedIds.add(row.id);
    }
    return Promise.resolve({ identifiers: [], generatedMaps: [], raw: [] });
  });

  return {
    repository: { find, insert } as unknown as Repository<SeedRecord>,
    find,
    insert,
  };
}

describe('insertMissing', () => {
  it('skips repository work for an empty seed', async () => {
    const { repository, find, insert } = createRepository();

    await insertMissing(repository, []);

    expect(find).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('inserts only missing IDs and remains idempotent across runs', async () => {
    const { repository, find, insert } = createRepository(['existing']);
    const rows = [{ id: 'existing' }, { id: 'new' }];

    await insertMissing(repository, rows);
    await insertMissing(repository, rows);

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ withDeleted: true }),
    );
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith([{ id: 'new' }]);
  });
});
