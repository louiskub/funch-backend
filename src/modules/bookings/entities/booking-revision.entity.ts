import {
  Column,
  Check,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { BookingStatus } from '../enums/booking-status.enum';

export interface BookingRevisionOptionState {
  carOptionId: string;
  name: string;
  quantity: number;
  unitPriceAtBooking: string;
  chargedUnits: number;
  totalAmount: string;
}

export interface BookingRevisionState {
  status: BookingStatus;
  pickupAt: string;
  returnAt: string;
  currencyCode: string;
  dailyRateAtBooking: string;
  hourlyRateAtBooking: string;
  chargedDays: number;
  chargedHours: number;
  rentalSubtotal: string;
  optionsSubtotal: string;
  totalAmount: string;
  paidAmount: string;
  approvedBy: string | null;
  approvedAt: string | null;
  options: BookingRevisionOptionState[];
}

@Entity({ name: 'booking_revision' })
@Unique(['bookingId', 'revisionNumber'])
@Check('booking_revision_number_check', 'revision_number > 0')
@Index('booking_revision_booking_created_idx', ['bookingId', 'createdAt'])
export class BookingRevision {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId!: string;

  @Column({ name: 'revision_number', type: 'integer' })
  revisionNumber!: number;

  @Column({ name: 'changed_by', type: 'uuid' })
  changedBy!: string;

  @Column({ name: 'before_state', type: 'jsonb' })
  beforeState!: BookingRevisionState;

  @Column({ name: 'after_state', type: 'jsonb' })
  afterState!: BookingRevisionState;

  @Column({ name: 'amount_delta', type: 'numeric', precision: 14, scale: 4 })
  amountDelta!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
