import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity({ name: 'car_type_branch' })
@Unique(['carTypeId', 'branchId'])
@Index('car_type_branch_branch_active_type_idx', [
  'branchId',
  'isActive',
  'carTypeId',
])
export class CarTypeBranch extends BaseEntity {
  @Column({ name: 'car_type_id', type: 'uuid' }) carTypeId!: string;
  @Column({ name: 'branch_id', type: 'uuid' }) branchId!: string;
  @Column({ name: 'base_daily_rate', type: 'numeric', precision: 14, scale: 4 })
  baseDailyRate!: string;
  @Column({
    name: 'base_hourly_rate',
    type: 'numeric',
    precision: 14,
    scale: 4,
  })
  baseHourlyRate!: string;
  @Column({ name: 'currency_code', type: 'char', length: 3 })
  currencyCode!: string;
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
