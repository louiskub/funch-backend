import {
  In,
  type FindOptionsWhere,
  type QueryDeepPartialEntity,
  type Repository,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

export async function insertMissing<T extends BaseEntity>(
  repository: Repository<T>,
  rows: (QueryDeepPartialEntity<T> & { id: string })[],
): Promise<void> {
  if (!rows.length) return;
  const ids = rows.map((r) => r.id);
  const existing = await repository.find({
    select: ['id'] as (keyof T)[],
    where: { id: In(ids) } as FindOptionsWhere<T>,
    withDeleted: true,
  });
  const existingIds = new Set(existing.map(({ id }) => id));
  const missing = rows.filter((r) => !existingIds.has(r.id));
  if (missing.length) await repository.insert(missing);
}
