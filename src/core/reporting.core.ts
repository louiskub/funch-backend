import type {
  BookingStatus,
  CurrencyCode,
  ExactDecimal,
  IsoInstant,
  Money,
} from './core.types';
import { addDecimals, assertSameCurrency } from './decimal.core';
import { parseIsoInstant } from './time.core';

const INCLUDED_STATUSES: BookingStatus[] = ['APPROVED', 'IN_USE', 'COMPLETED'];

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

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
  const from = parseIsoInstant(input.createdFrom).toMillis();
  const to = parseIsoInstant(input.createdTo).toMillis();
  if (to <= from)
    throw new RangeError('Report range must have positive duration');

  const counts = new Map<string, BookingCountByStatus>();
  const values = new Map<string, BookingValueByCurrency>();
  const charges = new Map<string, BookingValueByCurrency>();
  const popular = new Map<string, PopularCarType>();
  const bookings = input.bookings.filter((booking) => {
    const createdAt = parseIsoInstant(booking.createdAt).toMillis();
    return createdAt >= from && createdAt < to;
  });

  for (const booking of bookings) {
    const countKey = `${booking.branchId}\u0000${booking.status}`;
    const count = counts.get(countKey);
    if (count) count.count += 1;
    else
      counts.set(countKey, {
        branchId: booking.branchId,
        status: booking.status,
        count: 1,
      });

    if (!INCLUDED_STATUSES.includes(booking.status)) continue;
    assertSameCurrency(
      booking.totalAmount,
      ...booking.confirmedAdditionalCharges,
    );
    const valueKey = `${booking.branchId}\u0000${booking.totalAmount.currency}`;
    const value = values.get(valueKey);
    if (value)
      value.amount = addDecimals(value.amount, booking.totalAmount.amount);
    else
      values.set(valueKey, {
        branchId: booking.branchId,
        currency: booking.totalAmount.currency,
        amount: booking.totalAmount.amount,
      });

    for (const charge of booking.confirmedAdditionalCharges) {
      const chargeKey = `${booking.branchId}\u0000${charge.currency}`;
      const total = charges.get(chargeKey);
      if (total) total.amount = addDecimals(total.amount, charge.amount);
      else
        charges.set(chargeKey, {
          branchId: booking.branchId,
          currency: charge.currency,
          amount: charge.amount,
        });
    }

    const popularKey = `${booking.branchId}\u0000${booking.carTypeId}`;
    const carType = popular.get(popularKey);
    if (carType) carType.bookingCount += 1;
    else
      popular.set(popularKey, {
        branchId: booking.branchId,
        carTypeId: booking.carTypeId,
        bookingCount: 1,
      });
  }

  return {
    bookingCounts: [...counts.values()].sort(
      (a, b) =>
        compareText(a.branchId, b.branchId) || compareText(a.status, b.status),
    ),
    bookingValues: [...values.values()].sort(
      (a, b) =>
        compareText(a.branchId, b.branchId) ||
        compareText(a.currency, b.currency),
    ),
    confirmedAdditionalChargeValues: [...charges.values()].sort(
      (a, b) =>
        compareText(a.branchId, b.branchId) ||
        compareText(a.currency, b.currency),
    ),
    popularCarTypes: [...popular.values()].sort(
      (a, b) =>
        compareText(a.branchId, b.branchId) ||
        b.bookingCount - a.bookingCount ||
        compareText(a.carTypeId, b.carTypeId),
    ),
  };
}
