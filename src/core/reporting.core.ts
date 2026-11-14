import type {
  BookingStatus,
  CurrencyCode,
  ExactDecimal,
  IsoInstant,
  Money,
} from './core.types';

export interface BookingSummaryRecord {
  branchId: string;
  carTypeId: string;
  createdAt: IsoInstant;
  status: BookingStatus;
  totalAmount: Money;
  confirmedAdditionalCharges: Money[];
}

export interface SummarizeBookingsInput {
  createdFrom: IsoInstant;
  createdTo: IsoInstant;
  bookings: BookingSummaryRecord[];
}

export interface BookingCountByStatus {
  branchId: string;
  status: BookingStatus;
  count: number;
}

export interface BookingValueByCurrency {
  branchId: string;
  currency: CurrencyCode;
  amount: ExactDecimal;
}

export interface PopularCarType {
  branchId: string;
  carTypeId: string;
  bookingCount: number;
}

export interface SummarizeBookingsResult {
  bookingCounts: BookingCountByStatus[];
  bookingValues: BookingValueByCurrency[];
  confirmedAdditionalChargeValues: BookingValueByCurrency[];
  popularCarTypes: PopularCarType[];
}

export function summarizeBookings(
  input: SummarizeBookingsInput,
): SummarizeBookingsResult {
  void input;
  throw new Error('Not implemented: summarizeBookings (BL-09)');
}
