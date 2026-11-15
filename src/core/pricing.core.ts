import type { IsoInstant, IanaTimeZone, Money } from './core.types';
import {
  addDecimals,
  assertSameCurrency,
  compareDecimals,
  multiplyDecimalByInteger,
  subtractDecimals,
} from './decimal.core';
import { parseIsoInstant } from './time.core';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function durationMillis(start: IsoInstant, end: IsoInstant): number {
  const difference =
    parseIsoInstant(end).toMillis() - parseIsoInstant(start).toMillis();
  if (!Number.isFinite(difference) || difference <= 0)
    throw new RangeError('Return time must be after pickup time');
  return difference;
}

function validateQuantity(quantity: number, name: string): void {
  if (!Number.isSafeInteger(quantity) || quantity <= 0)
    throw new RangeError(`${name} must be a positive safe integer`);
}
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
  const { pickupAt, returnAt, branchTimeZone, hourlyRate, dailyRate } = input;
  const currency = assertSameCurrency(hourlyRate, dailyRate);
  if (
    compareDecimals(hourlyRate.amount, '0') <= 0 ||
    compareDecimals(dailyRate.amount, '0') <= 0
  )
    throw new RangeError('Rental rates must be greater than zero');

  const elapsed = durationMillis(pickupAt, returnAt);
  const returnInstant = parseIsoInstant(returnAt);
  const localReturn = returnInstant.setZone(branchTimeZone);
  if (!localReturn.isValid)
    throw new TypeError(`Invalid branch timezone: ${branchTimeZone}`);

  let days = Math.floor(elapsed / DAY_MS);
  const remainder = elapsed - days * DAY_MS;
  let hours = Math.ceil(remainder / HOUR_MS);
  const afterCutoff =
    localReturn.hour > 14 ||
    (localReturn.hour === 14 &&
      (localReturn.minute > 0 ||
        localReturn.second > 0 ||
        localReturn.millisecond > 0));

  if (remainder > 0 && (remainder > 8 * HOUR_MS || afterCutoff)) {
    days += 1;
    hours = 0;
  } else if (hours > 0) {
    const hourlyRemainder = multiplyDecimalByInteger(hourlyRate.amount, hours);
    if (compareDecimals(hourlyRemainder, dailyRate.amount) > 0) {
      days += 1;
      hours = 0;
    }
  }

  const rentalSubtotalAmount = addDecimals(
    multiplyDecimalByInteger(dailyRate.amount, days),
    multiplyDecimalByInteger(hourlyRate.amount, hours),
  );

  return {
    chargedDays: days,
    chargedHours: hours,
    rentalSubtotal: {
      amount: rentalSubtotalAmount,
      currency,
    },
  };
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
  const { pickupAt, returnAt, pricingType, unitPrice, quantity } = input;
  assertSameCurrency(unitPrice);
  validateQuantity(quantity, 'Option quantity');
  const days = Math.ceil(durationMillis(pickupAt, returnAt) / DAY_MS);
  const chargedUnits = pricingType === 'FIXED' ? 1 : days;
  const multiplier =
    pricingType === 'PER_UNIT_PER_DAY' ? days * quantity : chargedUnits;
  if (!Number.isSafeInteger(multiplier))
    throw new RangeError('Option quantity is too large');
  const totalAmount = multiplyDecimalByInteger(unitPrice.amount, multiplier);

  return {
    chargedUnits,
    totalAmount: {
      amount: totalAmount,
      currency: unitPrice.currency,
    },
  };
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
  const { rentalPrice, optionPrices } = input;
  const currency = assertSameCurrency(rentalPrice, ...optionPrices);
  const optionsSubtotalAmount = optionPrices.reduce(
    (sum, optionPrice) => addDecimals(sum, optionPrice.amount),
    '0',
  );
  const totalAmount = addDecimals(rentalPrice.amount, optionsSubtotalAmount);

  return {
    rentalSubtotal: rentalPrice,
    optionsSubtotal: {
      amount: optionsSubtotalAmount,
      currency,
    },
    totalAmount: {
      amount: totalAmount,
      currency,
    },
  };
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

export type AdditionalChargeLine =
  | {
      kind: 'EXTRA_RENTAL';
      bookingOptionId: null;
      quantity: number;
      unitPrice: Money;
      amount: Money;
    }
  | {
      kind: 'EXTRA_OPTION';
      bookingOptionId: string;
      quantity: number;
      unitPrice: Money;
      amount: Money;
    };

export function calculateLateReturnCharges(
  input: CalculateLateReturnChargesInput,
): AdditionalChargeLine[] {
  const {
    pickupAt,
    returnAt,
    actualReturnAt,
    branchTimeZone,
    hourlyRate,
    dailyRate,
    rentalSubtotal,
    options,
  } = input;

  const currency = assertSameCurrency(
    hourlyRate,
    dailyRate,
    rentalSubtotal,
    ...options.flatMap((option) => [option.unitPrice, option.totalAmount]),
  );
  durationMillis(pickupAt, returnAt);
  durationMillis(pickupAt, actualReturnAt);
  if (
    parseIsoInstant(actualReturnAt).toMillis() <=
    parseIsoInstant(returnAt).toMillis()
  )
    return [];

  const actualRentalCharges = calculateRentalPrice({
    pickupAt,
    returnAt: actualReturnAt,
    branchTimeZone,
    hourlyRate,
    dailyRate,
  });

  const additionalCharges: AdditionalChargeLine[] = [];
  if (
    compareDecimals(
      actualRentalCharges.rentalSubtotal.amount,
      rentalSubtotal.amount,
    ) > 0
  ) {
    const rentalDifference = subtractDecimals(
      actualRentalCharges.rentalSubtotal.amount,
      rentalSubtotal.amount,
    );
    const amount: Money = { amount: rentalDifference, currency };
    additionalCharges.push({
      kind: 'EXTRA_RENTAL',
      bookingOptionId: null,
      quantity: 1,
      unitPrice: amount,
      amount,
    });
  }

  const bookedDays = Math.ceil(durationMillis(pickupAt, returnAt) / DAY_MS);
  const actualDays = Math.ceil(
    durationMillis(pickupAt, actualReturnAt) / DAY_MS,
  );
  for (const option of options) {
    validateQuantity(option.quantity, 'Option quantity');
    validateQuantity(option.chargedUnits, 'Booked option units');
    if (option.pricingType === 'FIXED') continue;
    const extraDays = Math.max(
      0,
      actualDays - Math.max(bookedDays, option.chargedUnits),
    );
    if (extraDays === 0) continue;
    const quantity =
      option.pricingType === 'PER_UNIT_PER_DAY' ? option.quantity : 1;
    const unitAmount = multiplyDecimalByInteger(
      option.unitPrice.amount,
      extraDays,
    );
    const amount = multiplyDecimalByInteger(unitAmount, quantity);
    additionalCharges.push({
      kind: 'EXTRA_OPTION',
      bookingOptionId: option.bookingOptionId,
      quantity,
      unitPrice: { amount: unitAmount, currency },
      amount: { amount, currency },
    });
  }
  return additionalCharges;
}
