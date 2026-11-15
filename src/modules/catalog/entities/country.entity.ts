import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { DrivingSide } from '../enums/driving-side.enum';

@Entity({ name: 'country' })
export class Country extends BaseEntity {
  @Column({ type: 'char', length: 2, unique: true }) code!: string;
  @Column({ type: 'text' }) name!: string;
  @Column({ name: 'currency_code', type: 'char', length: 3 })
  currencyCode!: string;
  @Column({ name: 'driving_side', type: 'enum', enum: DrivingSide })
  drivingSide!: DrivingSide;
}
