import type { ExactDecimal } from './core.types';
import { addDecimals, compareDecimals, subtractDecimals } from './decimal.core';

export interface CalculateBookingEditAmountsInput {
  currentTotal: ExactDecimal;
  paidAmount: ExactDecimal;
  nextTotal: ExactDecimal;
}

export interface CalculateBookingEditAmountsResult {
  amountDelta: ExactDecimal;
  amountDue: ExactDecimal;
  creditUsed: ExactDecimal;
  nextPaidAmount: ExactDecimal;
  remainingCredit: ExactDecimal;
}

export function calculateBookingEditAmounts({
  currentTotal,
  paidAmount,
  nextTotal,
}: CalculateBookingEditAmountsInput): CalculateBookingEditAmountsResult {
  const totalChange = compareDecimals(nextTotal, currentTotal);
  const amountDelta =
    totalChange < 0
      ? `-${subtractDecimals(currentTotal, nextTotal)}`
      : subtractDecimals(nextTotal, currentTotal);
  const currentCredit =
    compareDecimals(paidAmount, currentTotal) > 0
      ? subtractDecimals(paidAmount, currentTotal)
      : '0';
  const increase = totalChange > 0 ? amountDelta : '0';
  const creditUsed =
    compareDecimals(currentCredit, increase) < 0 ? currentCredit : increase;
  const amountDue =
    compareDecimals(nextTotal, paidAmount) > 0
      ? subtractDecimals(nextTotal, paidAmount)
      : '0';
  const nextPaidAmount = addDecimals(paidAmount, amountDue);
  const remainingCredit =
    compareDecimals(nextPaidAmount, nextTotal) > 0
      ? subtractDecimals(nextPaidAmount, nextTotal)
      : '0';

  return {
    amountDelta,
    amountDue,
    creditUsed,
    nextPaidAmount,
    remainingCredit,
  };
}
