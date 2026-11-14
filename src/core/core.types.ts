/** Decimal text (for example, "125.40"); never a floating-point amount. */
export type ExactDecimal = string;
/** ISO 4217 currency code. */
export type CurrencyCode = string;
/** ISO 8601 instant with Z or an explicit numeric UTC offset. */
export type IsoInstant = string;
/** IANA timezone identifier, such as "Asia/Bangkok". */
export type IanaTimeZone = string;

export interface Money {
  amount: ExactDecimal;
  currency: CurrencyCode;
}

export type BookingStatus =
  'PENDING' | 'APPROVED' | 'REJECTED' | 'IN_USE' | 'COMPLETED' | 'CANCELLED';

export type PolicyDecision =
  { allowed: true; reason: null } | { allowed: false; reason: string };
