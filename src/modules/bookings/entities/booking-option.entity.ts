import { Check, Column, Entity, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity({ name: 'booking_option' })
@Unique(['bookingId', 'carOptionId'])
@Check('booking_option_quantity_check', 'quantity > 0')
@Check('booking_option_unit_price_check', 'unit_price_at_booking >= 0')
@Check('booking_option_charged_units_check', 'charged_units > 0')
@Check('booking_option_total_check', 'total_amount >= 0')
export class BookingOption extends BaseEntity {
  @Column({ name: 'booking_id', type: 'uuid' }) bookingId!: string;
  @Column({ name: 'car_option_id', type: 'uuid' }) carOptionId!: string;
  @Column({ type: 'integer' }) quantity!: number;
  @Column({
    name: 'unit_price_at_booking',
    type: 'numeric',
    precision: 14,
    scale: 4,
  })
  unitPriceAtBooking!: string;
  @Column({ name: 'charged_units', type: 'integer' }) chargedUnits!: number;
  @Column({ name: 'total_amount', type: 'numeric', precision: 14, scale: 4 })
  totalAmount!: string;
}
