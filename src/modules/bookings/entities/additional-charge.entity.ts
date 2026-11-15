import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { AdditionalChargeType } from '../enums/additional-charge-type.enum';

@Entity({ name: 'additional_charge' })
@Index('additional_charge_booking_idx', ['bookingId', 'status'])
@Index('additional_charge_extra_rental_once_idx', ['bookingId'], {
  unique: true,
  where: "type='EXTRA_RENTAL'",
})
@Index('additional_charge_extra_option_once_idx', ['bookingOptionId'], {
  unique: true,
  where: "type='EXTRA_OPTION'",
})
@Check(
  'additional_charge_option_check',
  "(type = 'EXTRA_OPTION' AND booking_option_id IS NOT NULL) OR (type <> 'EXTRA_OPTION' AND booking_option_id IS NULL)",
)
export class AdditionalCharge extends BaseEntity {
  @Column({ name: 'booking_id', type: 'uuid' }) bookingId!: string;
  @Column({ name: 'booking_option_id', type: 'uuid', nullable: true })
  bookingOptionId!: string | null;
  @Column({ type: 'enum', enum: AdditionalChargeType })
  type!: AdditionalChargeType;
  @Column({ type: 'text' }) description!: string;
  @Column({ type: 'integer' }) quantity!: number;
  @Column({ name: 'unit_price', type: 'numeric', precision: 14, scale: 4 })
  unitPrice!: string;
  @Column({ type: 'numeric', precision: 14, scale: 4 }) amount!: string;
  @Column({ type: 'text' }) status!: string;
  @Column({ name: 'created_by', type: 'uuid' }) createdBy!: string;
}
