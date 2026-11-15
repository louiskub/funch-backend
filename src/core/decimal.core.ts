import type { ExactDecimal, Money } from './core.types';

interface DecimalParts {
  coefficient: bigint;
  scale: number;
}

function parseDecimal(value: ExactDecimal): DecimalParts {
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new TypeError(`Invalid non-negative decimal: ${value}`);
  const fraction = match[2] ?? '';
  return {
    coefficient: BigInt(`${match[1]}${fraction}`),
    scale: fraction.length,
  };
}

function align(a: DecimalParts, b: DecimalParts): [bigint, bigint, number] {
  const scale = Math.max(a.scale, b.scale);
  return [
    a.coefficient * 10n ** BigInt(scale - a.scale),
    b.coefficient * 10n ** BigInt(scale - b.scale),
    scale,
  ];
}

function formatDecimal(coefficient: bigint, scale: number): ExactDecimal {
  if (coefficient < 0n) throw new RangeError('Money cannot be negative');
  if (scale === 0) return coefficient.toString();

  const digits = coefficient.toString().padStart(scale + 1, '0');
  const whole = digits.slice(0, -scale);
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

export function addDecimals(a: ExactDecimal, b: ExactDecimal): ExactDecimal {
  const [left, right, scale] = align(parseDecimal(a), parseDecimal(b));
  return formatDecimal(left + right, scale);
}

export function subtractDecimals(
  a: ExactDecimal,
  b: ExactDecimal,
): ExactDecimal {
  const [left, right, scale] = align(parseDecimal(a), parseDecimal(b));
  return formatDecimal(left - right, scale);
}

export function multiplyDecimalByInteger(
  amount: ExactDecimal,
  multiplier: number,
): ExactDecimal {
  if (!Number.isSafeInteger(multiplier) || multiplier < 0)
    throw new RangeError(
      'Money multiplier must be a non-negative safe integer',
    );
  const value = parseDecimal(amount);
  return formatDecimal(value.coefficient * BigInt(multiplier), value.scale);
}

export function compareDecimals(a: ExactDecimal, b: ExactDecimal): number {
  const [left, right] = align(parseDecimal(a), parseDecimal(b));
  return left === right ? 0 : left < right ? -1 : 1;
}

export function assertSameCurrency(...values: Money[]): string {
  const currency = values[0]?.currency;
  if (!currency || values.some((value) => value.currency !== currency))
    throw new TypeError('Money values must use the same currency');
  for (const value of values) parseDecimal(value.amount);
  return currency;
}

export const CURRENCY_MINOR_UNITS: Record<string, number> = {
  AED: 2,
  AUD: 2,
  CAD: 2,
  GBP: 2,
  JPY: 0,
  KRW: 0,
  MYR: 2,
  SGD: 2,
  THB: 2,
  USD: 2,
};

export function getCurrencyMinorUnits(currencyCode: string): number {
  return CURRENCY_MINOR_UNITS[currencyCode.toUpperCase()] ?? 2;
}

export function isValidMinorUnitsAmount(
  amount: ExactDecimal,
  currencyCode: string,
): boolean {
  const match = /^(?:0|[1-9]\d*)(?:\.(\d+))?$/.exec(amount);
  if (!match) return false;
  const fraction = match[1] ?? '';
  const minorUnits = getCurrencyMinorUnits(currencyCode);
  return fraction.length <= minorUnits;
}
