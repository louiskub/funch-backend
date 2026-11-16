import { Column, Check, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { BookingStatus } from '../enums/booking-status.enum';
import { Currency } from '../../catalog/entities/currency.entity';

@Entity({ name: 'booking' })
@Check('booking_interval_check', 'return_at > pickup_at')
@Index('booking_user_created_idx', ['userId', 'createdAt'])
@Index('booking_capacity_idx', [
  'carTypeBranchId',
  'status',
  'pickupAt',
  'returnAt',
])
@Index('booking_car_status_idx', ['carId', 'status'])
export class Booking extends BaseEntity {
  @Column({ name: 'booking_number', type: 'text', unique: true })
  bookingNumber!: string;
  @Column({ name: 'checkout_key', type: 'uuid', unique: true })
  checkoutKey!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'car_type_branch_id', type: 'uuid' })
  carTypeBranchId!: string;
  @Column({ name: 'car_id', type: 'uuid', nullable: true }) carId!:
    string | null;
  @Column({ name: 'pickup_branch_id', type: 'uuid' }) pickupBranchId!: string;
  @Column({ name: 'return_branch_id', type: 'uuid' }) returnBranchId!: string;
  @Column({ name: 'pickup_at', type: 'timestamptz' }) pickupAt!: Date;
  @Column({ name: 'return_at', type: 'timestamptz' }) returnAt!: Date;
  @Column({ name: 'actual_return_at', type: 'timestamptz', nullable: true })
  actualReturnAt!: Date | null;
  @Column({ name: 'ready_at', type: 'timestamptz', nullable: true })
  readyAt!: Date | null;
  @Column({ name: 'ready_by', type: 'uuid', nullable: true })
  readyBy!: string | null;
  @Column({ type: 'enum', enum: BookingStatus, default: BookingStatus.PENDING })
  status!: BookingStatus;
  @Column({ name: 'currency_code', type: 'char', length: 3 })
  currencyCode!: string;

  @ManyToOne(() => Currency)
  @JoinColumn({ name: 'currency_code', referencedColumnName: 'code' })
  currency?: Currency;
  @Column({
    name: 'daily_rate_at_booking',
    type: 'numeric',
    precision: 14,
    scale: 4,
  })
  dailyRateAtBooking!: string;
  @Column({
    name: 'hourly_rate_at_booking',
    type: 'numeric',
    precision: 14,
    scale: 4,
  })
  hourlyRateAtBooking!: string;
  @Column({ name: 'charged_days', type: 'integer' }) chargedDays!: number;
  @Column({ name: 'charged_hours', type: 'integer' }) chargedHours!: number;
  @Column({ name: 'rental_subtotal', type: 'numeric', precision: 14, scale: 4 })
  rentalSubtotal!: string;
  @Column({
    name: 'options_subtotal',
    type: 'numeric',
    precision: 14,
    scale: 4,
  })
  optionsSubtotal!: string;
  @Column({ name: 'total_amount', type: 'numeric', precision: 14, scale: 4 })
  totalAmount!: string;
  @Column({ name: 'approved_by', type: 'uuid', nullable: true }) approvedBy!:
    string | null;
  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;
  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;
  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason!: string | null;
}
