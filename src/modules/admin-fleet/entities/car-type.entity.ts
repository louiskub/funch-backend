import { Column, Entity, Unique, Check } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { CarTransmission } from '../enums/car-transmission.enum';
import { CarFuelType } from '../enums/car-fuel-type.enum';

@Entity({ name: 'car_type' })
@Unique(['brand', 'model'])
@Check('car_type_seats_check', 'seats > 0')
export class CarType extends BaseEntity {
  @Column({ type: 'text' }) brand!: string;
  @Column({ type: 'text' }) model!: string;
  @Column({ type: 'integer' }) seats!: number;
  @Column({ type: 'enum', enum: CarTransmission })
  transmission!: CarTransmission;
  @Column({ name: 'fuel_type', type: 'enum', enum: CarFuelType })
  fuelType!: CarFuelType;
  @Column({ type: 'text', array: true, default: '{}' }) features!: string[];
  @Column({ name: 'image_file_ids', type: 'uuid', array: true, default: '{}' })
  imageFileIds!: string[];
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
