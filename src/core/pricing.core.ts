import type { IsoInstant, IanaTimeZone, Money } from './core.types';

export interface CalculateRentalPriceInput {
  pickupAt: IsoInstant;
  returnAt: IsoInstant;
  branchTimeZone: IanaTimeZone;
  hourlyRate: Money;
  dailyRate: Money;
}

export interface CalculateRentalPriceResult {
  chargedDays: number;
  chargedHours: number;
  rentalSubtotal: Money;
}

export function calculateRentalPrice(
  input: CalculateRentalPriceInput,
): CalculateRentalPriceResult {
  void input;
  throw new Error('Not implemented: calculateRentalPrice (BL-01)');
}

export type OptionPricingType = 'FIXED' | 'PER_DAY' | 'PER_UNIT_PER_DAY';

export interface CalculateOptionPriceInput {
  pickupAt: IsoInstant;
  returnAt: IsoInstant;
  pricingType: OptionPricingType;
  unitPrice: Money;
  quantity: number;
}

export interface CalculateOptionPriceResult {
  chargedUnits: number;
  totalAmount: Money;
}

export function calculateOptionPrice(
  input: CalculateOptionPriceInput,
): CalculateOptionPriceResult {
  void input;
  throw new Error('Not implemented: calculateOptionPrice (BL-02)');
}

export interface CalculateBookingTotalInput {
  rentalPrice: Money;
  optionPrices: Money[];
}

export interface CalculateBookingTotalResult {
  rentalSubtotal: Money;
  optionsSubtotal: Money;
  totalAmount: Money;
}

export function calculateBookingTotal(
  input: CalculateBookingTotalInput,
): CalculateBookingTotalResult {
  void input;
  throw new Error('Not implemented: calculateBookingTotal (BL-03)');
}

export interface LateReturnOptionSnapshot {
  bookingOptionId: string;
  pricingType: OptionPricingType;
  quantity: number;
  unitPrice: Money;
  chargedUnits: number;
  totalAmount: Money;
}

export interface CalculateLateReturnChargesInput {
  pickupAt: IsoInstant;
  returnAt: IsoInstant;
  actualReturnAt: IsoInstant;
  branchTimeZone: IanaTimeZone;
  hourlyRate: Money;
  dailyRate: Money;
  rentalSubtotal: Money;
  options: LateReturnOptionSnapshot[];
}

export interface AdditionalChargeLine {
  kind: 'EXTRA_RENTAL' | 'EXTRA_OPTION';
  bookingOptionId: string | null;
  quantity: number;
  unitPrice: Money;
  amount: Money;
}

export function calculateLateReturnCharges(
  input: CalculateLateReturnChargesInput,
): AdditionalChargeLine[] {
  void input;
  throw new Error('Not implemented: calculateLateReturnCharges (BL-04)');
}
