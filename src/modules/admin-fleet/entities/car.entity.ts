import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { CarStatus } from '../enums/car-status.enum';

@Entity({ name: 'car' })
@Index('car_offer_active_plate_idx', [
  'carTypeBranchId',
  'isActive',
  'licensePlate',
])
export class Car extends BaseEntity {
  @Column({ name: 'car_type_branch_id', type: 'uuid' })
  carTypeBranchId!: string;
  @Column({ type: 'text', unique: true }) vin!: string;
  @Column({ name: 'license_plate', type: 'text', unique: true })
  licensePlate!: string;
  @Column({ type: 'integer' }) year!: number;
  @Column({ name: 'buy_date', type: 'date', nullable: true }) buyDate!:
    string | null;
  @Column({ type: 'enum', enum: CarStatus, default: CarStatus.ACTIVE })
  status!: CarStatus;
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
