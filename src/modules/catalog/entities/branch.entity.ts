import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity({ name: 'branch' })
@Index('branch_country_active_name_idx', ['countryId', 'isActive', 'name'])
export class Branch extends BaseEntity {
  @Column({ name: 'country_id', type: 'uuid' }) countryId!: string;
  @Column({ type: 'text' }) type!: string;
  @Column({ type: 'text', unique: true }) code!: string;
  @Column({ name: 'airport_code', type: 'char', length: 3, nullable: true })
  airportCode!: string | null;
  @Column({ type: 'text' }) name!: string;
  @Column({ type: 'text' }) city!: string;
  @Column({ type: 'text', nullable: true }) state!: string | null;
  @Column({ type: 'text' }) address!: string;
  @Column({ type: 'text' }) timezone!: string;
  @Column({ type: 'numeric', precision: 9, scale: 6 }) latitude!: string;
  @Column({ type: 'numeric', precision: 9, scale: 6 }) longitude!: string;
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
