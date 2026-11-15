import { Column, Check, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { CarOptionCategory } from '../enums/car-option-category.enum';
import { CarOptionPricingType } from '../enums/car-option-pricing-type.enum';

@Entity({ name: 'car_option' })
@Unique(['branchId', 'code'])
@Check('car_option_price_check', 'price >= 0')
@Check(
  'car_option_stock_check',
  'quantity_stock IS NULL OR quantity_stock >= 0',
)
@Index('car_option_branch_active_category_name_idx', [
  'branchId',
  'isActive',
  'category',
  'name',
])
export class CarOption extends BaseEntity {
  @Column({ name: 'branch_id', type: 'uuid' }) branchId!: string;
  @Column({ type: 'varchar', length: 40 }) code!: string;
  @Column({ type: 'varchar', length: 120 }) name!: string;
  @Column({ type: 'text', default: '' }) description!: string;
  @Column({ type: 'enum', enum: CarOptionCategory })
  category!: CarOptionCategory;
  @Column({ name: 'pricing_type', type: 'enum', enum: CarOptionPricingType })
  pricingType!: CarOptionPricingType;
  @Column({ type: 'numeric', precision: 14, scale: 4 }) price!: string;
  @Column({ name: 'quantity_stock', type: 'integer', nullable: true })
  quantityStock!: number | null;
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
