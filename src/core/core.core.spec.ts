import {
  calculateAvailableQuantity,
  calculateBookingTotal,
  calculateLateReturnCharges,
  calculateOptionPrice,
  calculateReadyAt,
  calculateRentalPrice,
  canAssignCar,
  canCancelBooking,
  getCurrencyMinorUnits,
  isValidMinorUnitsAmount,
  summarizeBookings,
} from './index';
import type {
  BookingStatus,
  BookingSummaryRecord,
  CalculateLateReturnChargesInput,
  CalculateRentalPriceInput,
  CanAssignCarInput,
  CanCancelBookingInput,
  Money,
  OptionPricingType,
  PolicyDecision,
  ReservedInterval,
  SummarizeBookingsInput,
} from './index';

const money = (amount: string, currency = 'THB'): Money => ({
  amount,
  currency,
});
const canonicalDecimal = (amount: string): string =>
  amount.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');

// Decimal text has no prescribed padding; compare exactly without Number/parseFloat.
function expectMoney(actual: Money, amount: string, currency = 'THB'): void {
  expect(actual.currency).toBe(currency);
  expect(actual.amount).toMatch(/^(0|[1-9]\d*)(\.\d+)?$/);
  expect(canonicalDecimal(actual.amount)).toBe(canonicalDecimal(amount));
}

function expectDenied(decision: PolicyDecision): void {
  expect(decision.allowed).toBe(false);
  expect(decision.reason).toEqual(expect.any(String));
  expect(decision.reason?.trim().length).toBeGreaterThan(0);
}

const rentalInput: CalculateRentalPriceInput = {
  pickupAt: '2026-11-16T08:00:00+07:00',
  returnAt: '2026-11-16T12:00:00+07:00',
  branchTimeZone: 'Asia/Bangkok',
  hourlyRate: money('100.00'),
  dailyRate: money('1000.00'),
};

// Expected results come from backlog.md (BL-01 through BL-09).
describe('calculateRentalPrice (BL-01)', () => {
  it.each([
    ['four hours', '16T08:00:00', '16T12:00:00', 0, 4, '400'],
    ['exactly eight hours at 14:00', '16T06:00:00', '16T14:00:00', 0, 8, '800'],
    ['eight hours before cutoff', '16T05:00:00', '16T13:00:00', 0, 8, '800'],
    ['over eight hours', '16T04:00:00', '16T13:30:00', 1, 0, '1000'],
    ['one second over eight hours', '16T04:00:00', '16T12:00:01', 1, 0, '1000'],
    ['after local cutoff', '16T11:00:00', '16T14:30:00', 1, 0, '1000'],
    ['one second after cutoff', '16T13:00:00', '16T14:00:01', 1, 0, '1000'],
    ['short evening rental', '16T22:00:00', '16T23:00:00', 1, 0, '1000'],
    ['overnight before cutoff', '16T22:00:00', '17T02:00:00', 0, 4, '400'],
    ['rounding an extra minute', '16T08:00:00', '16T09:01:00', 0, 2, '200'],
    ['rounding an extra second', '16T08:00:00', '16T09:00:01', 0, 2, '200'],
    ['one exact hour', '16T08:00:00', '16T09:00:00', 0, 1, '100'],
    ['eighteen hours', '16T16:00:00', '17T10:00:00', 1, 0, '1000'],
    ['exact 24 hours after cutoff', '16T16:00:00', '17T16:00:00', 1, 0, '1000'],
    ['24 hours plus one minute', '16T16:00:00', '17T16:01:00', 2, 0, '2000'],
    ['27 hours before cutoff', '16T09:00:00', '17T12:00:00', 1, 3, '1300'],
    ['29 hours after cutoff', '16T10:00:00', '17T15:00:00', 2, 0, '2000'],
    ['exact 48 hours', '16T16:00:00', '18T16:00:00', 2, 0, '2000'],
    [
      'two days and hourly remainder',
      '16T09:00:00',
      '18T12:00:00',
      2,
      3,
      '2300',
    ],
  ])('%s', (_name, pickup, returned, days, hours, subtotal) => {
    const result = calculateRentalPrice({
      ...rentalInput,
      pickupAt: `2026-11-${pickup}+07:00`,
      returnAt: `2026-11-${returned}+07:00`,
    });
    expect(result.chargedDays).toBe(days);
    expect(result.chargedHours).toBe(hours);
    expectMoney(result.rentalSubtotal, subtotal);
  });

  it('caps the hourly subtotal at the daily rate', () => {
    const result = calculateRentalPrice({
      ...rentalInput,
      hourlyRate: money('300'),
    });
    expectMoney(result.rentalSubtotal, '1000');
  });

  it('caps only the remainder when there is also a full day', () => {
    const result = calculateRentalPrice({
      ...rentalInput,
      returnAt: '2026-11-17T12:00:00+07:00',
      hourlyRate: money('300'),
    });
    expectMoney(result.rentalSubtotal, '2000');
  });

  it('uses the branch cutoff rather than the offset written in the input', () => {
    const result = calculateRentalPrice({
      ...rentalInput,
      pickupAt: '2026-11-16T04:00:00Z',
      returnAt: '2026-11-16T07:30:00Z',
    });
    expectMoney(result.rentalSubtotal, '1000');
  });

  it('can treat the same instants as hourly in a different branch timezone', () => {
    const result = calculateRentalPrice({
      ...rentalInput,
      pickupAt: '2026-11-16T04:00:00Z',
      returnAt: '2026-11-16T07:30:00Z',
      branchTimeZone: 'UTC',
    });
    expect(result.chargedHours).toBe(4);
    expectMoney(result.rentalSubtotal, '400');
  });

  it.each([
    [
      'spring forward: 23 elapsed hours',
      '2026-03-07T12:00:00-05:00',
      '2026-03-08T12:00:00-04:00',
      1,
      0,
      '1000',
    ],
    [
      'fall back: 25 elapsed hours',
      '2026-10-31T12:00:00-04:00',
      '2026-11-01T12:00:00-05:00',
      1,
      1,
      '1100',
    ],
    [
      'repeated local hour is one elapsed hour',
      '2026-11-01T01:30:00-04:00',
      '2026-11-01T01:30:00-05:00',
      0,
      1,
      '100',
    ],
  ])('%s', (_name, pickupAt, returnAt, days, hours, subtotal) => {
    const result = calculateRentalPrice({
      ...rentalInput,
      pickupAt,
      returnAt,
      branchTimeZone: 'America/New_York',
    });
    expect(result.chargedDays).toBe(days);
    expect(result.chargedHours).toBe(hours);
    expectMoney(result.rentalSubtotal, subtotal);
  });

  it('preserves four-place rate precision without rounding money to two decimals', () => {
    const result = calculateRentalPrice({
      ...rentalInput,
      returnAt: '2026-11-16T11:00:00+07:00',
      hourlyRate: money('0.1001', 'USD'),
      dailyRate: money('1.0000', 'USD'),
    });
    expectMoney(result.rentalSubtotal, '0.3003', 'USD');
  });
});

describe('calculateOptionPrice (BL-02)', () => {
  const input = {
    pickupAt: '2026-11-16T08:00:00+07:00',
    returnAt: '2026-11-16T12:00:00+07:00',
    unitPrice: money('100'),
    quantity: 3,
  };

  it.each<[OptionPricingType, string, number, string]>([
    ['FIXED', '2026-11-19T12:00:00+07:00', 1, '100'],
    ['PER_DAY', '2026-11-16T12:00:00+07:00', 1, '100'],
    ['PER_DAY', '2026-11-17T08:00:00+07:00', 1, '100'],
    ['PER_DAY', '2026-11-17T08:00:01+07:00', 2, '200'],
    ['PER_DAY', '2026-11-17T09:00:00+07:00', 2, '200'],
    ['PER_DAY', '2026-11-18T08:00:00+07:00', 2, '200'],
    ['PER_UNIT_PER_DAY', '2026-11-16T12:00:00+07:00', 1, '300'],
    ['PER_UNIT_PER_DAY', '2026-11-17T09:00:00+07:00', 2, '600'],
  ])(
    '%s until %s bills %s units',
    (pricingType, returnAt, chargedUnits, total) => {
      const result = calculateOptionPrice({ ...input, pricingType, returnAt });
      expect(result.chargedUnits).toBe(chargedUnits);
      expectMoney(result.totalAmount, total);
    },
  );

  it('does not apply the vehicle cutoff to daily equipment', () => {
    const result = calculateOptionPrice({
      ...input,
      pricingType: 'PER_DAY',
      returnAt: '2026-11-16T23:00:00+07:00',
    });
    expect(result.chargedUnits).toBe(1);
    expectMoney(result.totalAmount, '100');
  });

  it('uses elapsed 24-hour periods across a DST fall back', () => {
    const result = calculateOptionPrice({
      ...input,
      pricingType: 'PER_DAY',
      pickupAt: '2026-10-31T12:00:00-04:00',
      returnAt: '2026-11-01T12:00:00-05:00',
    });
    expect(result.chargedUnits).toBe(2);
    expectMoney(result.totalAmount, '200');
  });

  it('multiplies decimal unit prices exactly', () => {
    const result = calculateOptionPrice({
      ...input,
      pricingType: 'PER_UNIT_PER_DAY',
      unitPrice: money('0.1001', 'USD'),
    });
    expectMoney(result.totalAmount, '0.3003', 'USD');
  });
});

describe('calculateBookingTotal (BL-03)', () => {
  it('keeps rental and options subtotals separate', () => {
    const result = calculateBookingTotal({
      rentalPrice: money('1300'),
      optionPrices: [money('200'), money('150')],
    });
    expectMoney(result.rentalSubtotal, '1300');
    expectMoney(result.optionsSubtotal, '350');
    expectMoney(result.totalAmount, '1650');
  });

  it('accepts a booking without options', () => {
    const result = calculateBookingTotal({
      rentalPrice: money('1000', 'USD'),
      optionPrices: [],
    });
    expectMoney(result.rentalSubtotal, '1000', 'USD');
    expectMoney(result.optionsSubtotal, '0', 'USD');
    expectMoney(result.totalAmount, '1000', 'USD');
  });

  it('adds fractional amounts exactly', () => {
    const result = calculateBookingTotal({
      rentalPrice: money('0.1001'),
      optionPrices: [money('0.2002'), money('0.0001')],
    });
    expectMoney(result.optionsSubtotal, '0.2003');
    expectMoney(result.totalAmount, '0.3004');
  });

  it('retains small amounts when summing values beyond Number safe precision', () => {
    const result = calculateBookingTotal({
      rentalPrice: money('9007199254740991.0000'),
      optionPrices: [money('0.0001')],
    });
    expectMoney(result.totalAmount, '9007199254740991.0001');
  });

  it('rejects mixed currencies instead of silently converting them', () => {
    let error: unknown;
    try {
      calculateBookingTotal({
        rentalPrice: money('1000'),
        optionPrices: [money('100'), money('10', 'USD')],
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error))
      throw new Error('Expected a currency mismatch error');
    expect(error.message).not.toContain('Not implemented:');
  });
});

describe('calculateLateReturnCharges (BL-04)', () => {
  const input: CalculateLateReturnChargesInput = {
    ...rentalInput,
    actualReturnAt: '2026-11-17T12:00:00+07:00',
    rentalSubtotal: money('400'),
    options: [
      {
        bookingOptionId: 'seat',
        pricingType: 'PER_UNIT_PER_DAY',
        quantity: 2,
        unitPrice: money('100'),
        chargedUnits: 1,
        totalAmount: money('200'),
      },
      {
        bookingOptionId: 'service',
        pricingType: 'FIXED',
        quantity: 1,
        unitPrice: money('50'),
        chargedUnits: 1,
        totalAmount: money('50'),
      },
    ],
  };

  it.each(['2026-11-16T11:00:00+07:00', '2026-11-16T12:00:00+07:00'])(
    'does not add charges or refunds when returned at %s',
    (actualReturnAt) => {
      expect(calculateLateReturnCharges({ ...input, actualReturnAt })).toEqual(
        [],
      );
    },
  );

  it('adds only the rental and equipment differences from the booked snapshots', () => {
    const original = structuredClone(input);
    const lines = calculateLateReturnCharges(input);
    expect(lines).toHaveLength(2);
    const rental = lines.find((line) => line.kind === 'EXTRA_RENTAL');
    const seat = lines.find((line) => line.bookingOptionId === 'seat');
    expect(rental).toMatchObject({
      kind: 'EXTRA_RENTAL',
      bookingOptionId: null,
      quantity: 1,
    });
    expect(seat).toMatchObject({
      kind: 'EXTRA_OPTION',
      bookingOptionId: 'seat',
      quantity: 2,
    });
    if (!rental || !seat)
      throw new Error('Expected rental and seat charge lines');
    expectMoney(rental.unitPrice, '1000');
    expectMoney(rental.amount, '1000');
    expectMoney(seat.unitPrice, '100');
    expectMoney(seat.amount, '200');
    expect(input).toEqual(original);
  });

  it('does not bill an extra equipment day for lateness within the first 24 hours', () => {
    const lines = calculateLateReturnCharges({
      ...input,
      actualReturnAt: '2026-11-16T13:00:00+07:00',
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ kind: 'EXTRA_RENTAL', quantity: 1 });
    expectMoney(lines[0].amount, '100');
  });

  it('does not add anything if the booked vehicle price and equipment days already cover the return', () => {
    expect(
      calculateLateReturnCharges({
        ...input,
        returnAt: '2026-11-16T17:00:00+07:00',
        actualReturnAt: '2026-11-16T18:00:00+07:00',
        rentalSubtotal: money('1000'),
      }),
    ).toEqual([]);
  });

  it('clamps a negative rental difference to zero without suppressing equipment charges', () => {
    const lines = calculateLateReturnCharges({
      ...input,
      returnAt: '2026-11-17T07:00:00+07:00',
      actualReturnAt: '2026-11-17T08:00:01+07:00',
      rentalSubtotal: money('1500'),
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      kind: 'EXTRA_OPTION',
      bookingOptionId: 'seat',
      quantity: 2,
    });
    expectMoney(lines[0].amount, '200');
  });

  it('charges PER_DAY once and PER_UNIT_PER_DAY per item for multiple extra days', () => {
    const lines = calculateLateReturnCharges({
      ...input,
      actualReturnAt: '2026-11-18T12:00:00+07:00',
      options: [
        input.options[0],
        {
          bookingOptionId: 'wifi',
          pricingType: 'PER_DAY',
          quantity: 3,
          unitPrice: money('50'),
          chargedUnits: 1,
          totalAmount: money('50'),
        },
        input.options[1],
      ],
    });
    expect(lines).toHaveLength(3);
    const seat = lines.find((line) => line.bookingOptionId === 'seat');
    const wifi = lines.find((line) => line.bookingOptionId === 'wifi');
    expect(seat).toMatchObject({ quantity: 2 });
    expect(wifi).toMatchObject({ quantity: 1 });
    if (!seat || !wifi) throw new Error('Expected seat and wifi charge lines');
    expectMoney(seat.unitPrice, '200');
    expectMoney(seat.amount, '400');
    expectMoney(wifi.unitPrice, '100');
    expectMoney(wifi.amount, '100');
  });

  it('uses the branch cutoff and preserves the booking currency for extra rental', () => {
    const lines = calculateLateReturnCharges({
      ...input,
      hourlyRate: money('10', 'USD'),
      dailyRate: money('100', 'USD'),
      rentalSubtotal: money('40', 'USD'),
      actualReturnAt: '2026-11-16T07:01:00Z',
      options: [],
    });
    expect(lines).toHaveLength(1);
    expectMoney(lines[0].amount, '60', 'USD');
  });

  it('calculates a decimal rental difference exactly', () => {
    const lines = calculateLateReturnCharges({
      ...input,
      hourlyRate: money('0.1001'),
      dailyRate: money('1'),
      rentalSubtotal: money('0.4004'),
      actualReturnAt: '2026-11-16T13:00:00+07:00',
      options: [],
    });
    expect(lines).toHaveLength(1);
    expectMoney(lines[0].amount, '0.1001');
  });
});

describe('calculateReadyAt (BL-05)', () => {
  it.each([
    [null, '2026-11-16T07:00:00Z'],
    ['2026-11-16T14:30:00+07:00', '2026-11-16T08:30:00Z'],
    ['2026-11-16T10:00:00+07:00', '2026-11-16T04:00:00Z'],
    ['2026-11-16T12:00:00+07:00', '2026-11-16T06:00:00Z'],
  ])(
    'uses actual return %s when known, otherwise the estimate',
    (actualReturnAt, expected) => {
      const result = calculateReadyAt({
        returnAt: '2026-11-16T12:00:00+07:00',
        actualReturnAt,
      });
      expect(new Date(result.readyAt).toISOString()).toBe(
        new Date(expected).toISOString(),
      );
    },
  );

  it('adds elapsed hours across midnight', () => {
    const result = calculateReadyAt({
      returnAt: '2026-11-16T23:30:00+07:00',
      actualReturnAt: null,
    });
    expect(new Date(result.readyAt).toISOString()).toBe(
      '2026-11-16T18:30:00.000Z',
    );
  });

  it('adds elapsed hours across a DST transition', () => {
    const result = calculateReadyAt({
      returnAt: '2026-03-08T01:30:00-05:00',
      actualReturnAt: null,
    });
    expect(new Date(result.readyAt).toISOString()).toBe(
      '2026-03-08T08:30:00.000Z',
    );
  });

  it('extends readyAt to now + 2 hours when car is overdue and actual return is null', () => {
    const result = calculateReadyAt({
      returnAt: '2026-11-16T12:00:00+07:00',
      actualReturnAt: null,
      now: '2026-11-16T13:30:00+07:00',
    });
    expect(new Date(result.readyAt).toISOString()).toBe(
      new Date('2026-11-16T15:30:00+07:00').toISOString(),
    );
  });

  it('keeps returnAt + 2 hours when now is before returnAt', () => {
    const result = calculateReadyAt({
      returnAt: '2026-11-16T12:00:00+07:00',
      actualReturnAt: null,
      now: '2026-11-16T11:00:00+07:00',
    });
    expect(new Date(result.readyAt).toISOString()).toBe(
      new Date('2026-11-16T14:00:00+07:00').toISOString(),
    );
  });

  it('does not extend when actualReturnAt is known even if now is later', () => {
    const result = calculateReadyAt({
      returnAt: '2026-11-16T12:00:00+07:00',
      actualReturnAt: '2026-11-16T13:00:00+07:00',
      now: '2026-11-16T15:00:00+07:00',
    });
    expect(new Date(result.readyAt).toISOString()).toBe(
      new Date('2026-11-16T14:00:00+07:00').toISOString(),
    );
  });

  it('uses explicit readyAt when confirmed by staff, bypassing default cooldown', () => {
    const result = calculateReadyAt({
      returnAt: '2026-11-16T12:00:00+07:00',
      actualReturnAt: '2026-11-16T13:00:00+07:00',
      readyAt: '2026-11-16T13:20:00+07:00',
      now: '2026-11-16T13:25:00+07:00',
    });
    expect(new Date(result.readyAt).toISOString()).toBe(
      new Date('2026-11-16T13:20:00+07:00').toISOString(),
    );
  });
});

describe('calculateAvailableQuantity (BL-06)', () => {
  const interval = (
    startHour: number,
    endHour: number,
    quantity = 1,
  ): ReservedInterval => ({
    startsAt: `2026-11-16T${String(startHour).padStart(2, '0')}:00:00Z`,
    endsAt: `2026-11-16T${String(endHour).padStart(2, '0')}:00:00Z`,
    quantity,
  });

  it.each<[string, number, ReservedInterval[], number, number]>([
    ['no reservations', 3, [], 3, 0],
    ['zero capacity', 0, [], 0, 0],
    ['one reservation', 3, [interval(10, 12)], 2, 0],
    ['exactly full', 2, [interval(10, 14, 2)], 0, 0],
    ['over capacity', 2, [interval(10, 14, 3)], 0, 1],
    ['outside intervals', 3, [interval(7, 9), interval(15, 17)], 3, 0],
    [
      'touching boundaries are free',
      3,
      [interval(8, 10), interval(14, 16)],
      3,
      0,
    ],
    [
      'adjacent reservations share capacity',
      3,
      [interval(10, 12), interval(12, 14)],
      2,
      0,
    ],
    [
      'overlap peak, not sum of intersections',
      4,
      [interval(9, 12, 2), interval(11, 13), interval(13, 15, 2)],
      1,
      0,
    ],
    ['reservation enclosing request', 4, [interval(8, 18, 2)], 2, 0],
    ['reservation starting before request', 4, [interval(8, 11, 2)], 2, 0],
    ['reservation ending after request', 4, [interval(13, 18, 2)], 2, 0],
    [
      'peak outside request is ignored',
      3,
      [interval(8, 10, 5), interval(9, 11)],
      2,
      0,
    ],
    [
      'equipment quantities cause a shortfall',
      3,
      [interval(10, 13, 2), interval(11, 14, 3)],
      0,
      2,
    ],
    [
      'end events precede start events',
      3,
      [interval(10, 12, 3), interval(12, 14, 2)],
      0,
      0,
    ],
  ])(
    '%s',
    (
      _name,
      capacity,
      reservedIntervals,
      availableQuantity,
      shortfallQuantity,
    ) => {
      expect(
        calculateAvailableQuantity({
          requestedInterval: interval(10, 14),
          capacity,
          reservedIntervals,
        }),
      ).toEqual({
        availableQuantity,
        shortfallQuantity,
        peakReserved: capacity - availableQuantity + shortfallQuantity,
      });
    },
  );

  it('compares instants rather than lexicographic ISO strings', () => {
    expect(
      calculateAvailableQuantity({
        requestedInterval: interval(10, 14),
        capacity: 2,
        reservedIntervals: [
          {
            startsAt: '2026-11-16T17:00:00+07:00',
            endsAt: '2026-11-16T19:00:00+07:00',
            quantity: 1,
          },
        ],
      }),
    ).toEqual({
      availableQuantity: 1,
      shortfallQuantity: 0,
      peakReserved: 1,
    });
  });

  it('does not mutate or require sorted reservation input', () => {
    const reservedIntervals = [interval(12, 14), interval(10, 12, 2)];
    const original = structuredClone(reservedIntervals);
    expect(
      calculateAvailableQuantity({
        requestedInterval: interval(10, 14),
        capacity: 3,
        reservedIntervals,
      }),
    ).toEqual({
      availableQuantity: 1,
      shortfallQuantity: 0,
      peakReserved: 2,
    });
    expect(reservedIntervals).toEqual(original);
  });
});

describe('canCancelBooking (BL-07)', () => {
  const input: CanCancelBookingInput = {
    actor: { role: 'CUSTOMER', userId: 'customer-1' },
    booking: {
      customerId: 'customer-1',
      status: 'PENDING',
      pickupAt: '2026-11-16T10:00:00+07:00',
    },
    now: '2026-11-16T09:59:59+07:00',
    cancellationReason: null,
  };

  it.each<BookingStatus>(['PENDING', 'APPROVED'])(
    'allows customer cancellation of %s at the permitted time',
    (status) => {
      const now =
        status === 'PENDING' ? '2026-11-16T10:00:01+07:00' : input.now;
      expect(
        canCancelBooking({
          ...input,
          now,
          booking: { ...input.booking, status },
        }),
      ).toEqual({ allowed: true, reason: null });
    },
  );

  it.each(['2026-11-16T10:00:00+07:00', '2026-11-16T10:00:01+07:00'])(
    'denies customer cancellation of approved booking at or after pickup: %s',
    (now) => {
      expectDenied(
        canCancelBooking({
          ...input,
          now,
          booking: { ...input.booking, status: 'APPROVED' },
        }),
      );
    },
  );

  it.each<BookingStatus>(['PENDING', 'APPROVED'])(
    'allows admin cancellation of %s after pickup time',
    (status) => {
      expect(
        canCancelBooking({
          ...input,
          actor: { role: 'ADMIN', userId: 'admin-1' },
          booking: { ...input.booking, status },
          now: '2026-11-16T12:00:00+07:00',
          cancellationReason: 'Customer did not arrive',
        }),
      ).toEqual({ allowed: true, reason: null });
    },
  );

  describe.each<'CUSTOMER' | 'ADMIN'>(['CUSTOMER', 'ADMIN'])('%s', (role) => {
    it.each<BookingStatus>(['REJECTED', 'IN_USE', 'COMPLETED', 'CANCELLED'])(
      'denies cancellation of %s with a reason',
      (status) => {
        expectDenied(
          canCancelBooking({
            ...input,
            actor: { ...input.actor, role },
            booking: { ...input.booking, status },
            cancellationReason: 'Requested cancellation',
          }),
        );
      },
    );
  });

  it('compares pickup and now as instants with different offsets', () => {
    expectDenied(
      canCancelBooking({
        ...input,
        now: '2026-11-16T03:00:00Z',
        booking: { ...input.booking, status: 'APPROVED' },
      }),
    );
  });
});

describe('canAssignCar (BL-08)', () => {
  const input: CanAssignCarInput = {
    booking: {
      status: 'APPROVED',
      pickupAt: '2026-11-16T10:00:00+07:00',
      carTypeBranchId: 'offer-1',
    },
    car: {
      carTypeBranchId: 'offer-1',
      isOperational: true,
      isOutOnRent: false,
      readyAt: '2026-11-16T10:00:00+07:00',
    },
    now: '2026-11-16T10:00:00+07:00',
  };

  it('allows assignment exactly at pickup and cooldown end', () => {
    expect(canAssignCar(input)).toEqual({ allowed: true, reason: null });
  });

  it('allows a late pickup when the car is ready', () => {
    expect(
      canAssignCar({ ...input, now: '2026-11-16T12:00:00+07:00' }),
    ).toEqual({ allowed: true, reason: null });
  });

  it.each<BookingStatus>([
    'PENDING',
    'REJECTED',
    'IN_USE',
    'COMPLETED',
    'CANCELLED',
  ])('denies assignment of a %s booking', (status) => {
    expectDenied(
      canAssignCar({ ...input, booking: { ...input.booking, status } }),
    );
  });

  it('denies early pickup', () => {
    expectDenied(
      canAssignCar({
        ...input,
        now: '2026-11-16T09:59:59+07:00',
        car: { ...input.car, readyAt: '2026-11-16T09:00:00+07:00' },
      }),
    );
  });

  it('denies a different CarTypeBranch instead of automatically upgrading', () => {
    expectDenied(
      canAssignCar({
        ...input,
        car: { ...input.car, carTypeBranchId: 'offer-2' },
      }),
    );
  });

  it('denies a non-operational car', () => {
    expectDenied(
      canAssignCar({ ...input, car: { ...input.car, isOperational: false } }),
    );
  });

  it('denies a car still on rent even after estimated readyAt has passed', () => {
    expectDenied(
      canAssignCar({
        ...input,
        car: {
          ...input.car,
          isOutOnRent: true,
          readyAt: '2026-11-16T08:00:00+07:00',
        },
      }),
    );
  });

  it('denies a returned car while actual cooldown remains', () => {
    expectDenied(
      canAssignCar({
        ...input,
        car: { ...input.car, readyAt: '2026-11-16T10:00:01+07:00' },
      }),
    );
  });

  it('compares the same instant consistently across offsets', () => {
    expect(canAssignCar({ ...input, now: '2026-11-16T03:00:00Z' })).toEqual({
      allowed: true,
      reason: null,
    });
  });
});

describe('summarizeBookings (BL-09)', () => {
  const booking = (
    changes: Partial<BookingSummaryRecord> = {},
  ): BookingSummaryRecord => ({
    branchId: 'bangkok',
    carTypeId: 'camry',
    createdAt: '2026-11-16T00:00:00Z',
    status: 'APPROVED',
    totalAmount: money('1000'),
    confirmedAdditionalCharges: [],
    ...changes,
  });
  const input: SummarizeBookingsInput = {
    createdFrom: '2026-11-01T00:00:00Z',
    createdTo: '2026-12-01T00:00:00Z',
    bookings: [],
  };

  it('returns empty aggregates for an empty prefiltered report', () => {
    expect(summarizeBookings(input)).toEqual({
      bookingCounts: [],
      bookingValues: [],
      confirmedAdditionalChargeValues: [],
      popularCarTypes: [],
    });
  });

  it('filters the report range with an inclusive start and exclusive end', () => {
    const result = summarizeBookings({
      ...input,
      bookings: [
        booking({ createdAt: '2026-11-01T00:00:00Z' }),
        booking({ createdAt: '2026-11-30T23:59:59Z' }),
        booking({ createdAt: '2026-12-01T00:00:00Z' }),
      ],
    });
    expect(result.bookingCounts).toEqual([
      { branchId: 'bangkok', status: 'APPROVED', count: 2 },
    ]);
  });

  it('counts every status but values and popularity include only accepted bookings', () => {
    const statuses: BookingStatus[] = [
      'PENDING',
      'APPROVED',
      'REJECTED',
      'IN_USE',
      'COMPLETED',
      'CANCELLED',
    ];
    const result = summarizeBookings({
      ...input,
      bookings: statuses.map((status) => booking({ status })),
    });
    expect(result.bookingCounts).toHaveLength(6);
    expect(result.bookingCounts).toEqual(
      expect.arrayContaining(
        statuses.map((status) => ({ branchId: 'bangkok', status, count: 1 })),
      ),
    );
    expect(result.bookingValues).toHaveLength(1);
    expect(result.bookingValues[0]).toMatchObject({
      branchId: 'bangkok',
      currency: 'THB',
    });
    expect(canonicalDecimal(result.bookingValues[0].amount)).toBe('3000');
    expect(result.popularCarTypes).toEqual([
      { branchId: 'bangkok', carTypeId: 'camry', bookingCount: 3 },
    ]);
  });

  it('keeps branch and currency aggregates separate', () => {
    const result = summarizeBookings({
      ...input,
      bookings: [
        booking(),
        booking({ totalAmount: money('200') }),
        booking({ totalAmount: money('10', 'USD') }),
        booking({ branchId: 'phuket', totalAmount: money('500') }),
      ],
    });
    expect(
      result.bookingValues.map((row) => ({
        ...row,
        amount: canonicalDecimal(row.amount),
      })),
    ).toEqual(
      expect.arrayContaining([
        { branchId: 'bangkok', currency: 'THB', amount: '1200' },
        { branchId: 'bangkok', currency: 'USD', amount: '10' },
        { branchId: 'phuket', currency: 'THB', amount: '500' },
      ]),
    );
    expect(result.bookingValues).toHaveLength(3);
    expect(result.bookingCounts).toHaveLength(2);
    expect(result.bookingCounts).toEqual(
      expect.arrayContaining([
        { branchId: 'bangkok', status: 'APPROVED', count: 3 },
        { branchId: 'phuket', status: 'APPROVED', count: 1 },
      ]),
    );
    expect(result.popularCarTypes).toHaveLength(2);
    expect(result.popularCarTypes).toEqual(
      expect.arrayContaining([
        { branchId: 'bangkok', carTypeId: 'camry', bookingCount: 3 },
        { branchId: 'phuket', carTypeId: 'camry', bookingCount: 1 },
      ]),
    );
  });

  it('reports confirmed charges separately without multiplying the booking count or value', () => {
    const result = summarizeBookings({
      ...input,
      bookings: [
        booking({
          status: 'COMPLETED',
          confirmedAdditionalCharges: [money('100'), money('200')],
        }),
        booking({
          branchId: 'phuket',
          totalAmount: money('10', 'USD'),
          confirmedAdditionalCharges: [money('2', 'USD')],
        }),
      ],
    });
    expect(
      result.confirmedAdditionalChargeValues.map((row) => ({
        ...row,
        amount: canonicalDecimal(row.amount),
      })),
    ).toEqual(
      expect.arrayContaining([
        { branchId: 'bangkok', currency: 'THB', amount: '300' },
        { branchId: 'phuket', currency: 'USD', amount: '2' },
      ]),
    );
    expect(result.confirmedAdditionalChargeValues).toHaveLength(2);
    const bangkok = result.bookingValues.find(
      (row) => row.branchId === 'bangkok',
    );
    if (!bangkok) throw new Error('Expected Bangkok booking value');
    expect(canonicalDecimal(bangkok.amount)).toBe('1000');
    expect(result.bookingCounts).toEqual(
      expect.arrayContaining([
        { branchId: 'bangkok', status: 'COMPLETED', count: 1 },
      ]),
    );
    expect(result.popularCarTypes).toEqual(
      expect.arrayContaining([
        { branchId: 'bangkok', carTypeId: 'camry', bookingCount: 1 },
      ]),
    );
  });

  it('sums decimal snapshots and confirmed charges exactly', () => {
    const result = summarizeBookings({
      ...input,
      bookings: [
        booking({
          totalAmount: money('0.1001'),
          confirmedAdditionalCharges: [money('0.1001')],
        }),
        booking({
          totalAmount: money('0.2002'),
          confirmedAdditionalCharges: [money('0.2002')],
        }),
      ],
    });
    expect(canonicalDecimal(result.bookingValues[0].amount)).toBe('0.3003');
    expect(
      canonicalDecimal(result.confirmedAdditionalChargeValues[0].amount),
    ).toBe('0.3003');
  });

  it('ranks each branch by booking count, not price or option charge count', () => {
    const result = summarizeBookings({
      ...input,
      bookings: [
        booking({ carTypeId: 'expensive', totalAmount: money('99999') }),
        booking({ carTypeId: 'popular' }),
        booking({ carTypeId: 'popular' }),
        booking({ carTypeId: 'popular' }),
        booking({ carTypeId: 'runner-up' }),
        booking({ carTypeId: 'runner-up' }),
      ],
    });
    expect(result.popularCarTypes).toEqual([
      { branchId: 'bangkok', carTypeId: 'popular', bookingCount: 3 },
      { branchId: 'bangkok', carTypeId: 'runner-up', bookingCount: 2 },
      { branchId: 'bangkok', carTypeId: 'expensive', bookingCount: 1 },
    ]);
  });

  it('breaks popularity ties consistently regardless of input order without mutating input', () => {
    const bookings = [
      booking({ carTypeId: 'z-car' }),
      booking({ carTypeId: 'a-car' }),
      booking({ carTypeId: 'm-car' }),
    ];
    const original = structuredClone(bookings);
    const first = summarizeBookings({ ...input, bookings });
    const reversed = summarizeBookings({
      ...input,
      bookings: [...bookings].reverse(),
    });
    expect(first.popularCarTypes).toEqual(reversed.popularCarTypes);
    expect(first.popularCarTypes).toHaveLength(3);
    expect(bookings).toEqual(original);
  });

  describe('Currency minor units awareness and validation', () => {
    it('returns correct minor units according to reference data', () => {
      expect(getCurrencyMinorUnits('JPY')).toBe(0);
      expect(getCurrencyMinorUnits('KRW')).toBe(0);
      expect(getCurrencyMinorUnits('THB')).toBe(2);
      expect(getCurrencyMinorUnits('USD')).toBe(2);
      expect(getCurrencyMinorUnits('EUR')).toBe(2);
    });

    it('validates decimal fractions against currency minor units', () => {
      expect(isValidMinorUnitsAmount('1500', 'JPY')).toBe(true);
      expect(isValidMinorUnitsAmount('1500.0', 'JPY')).toBe(false);
      expect(isValidMinorUnitsAmount('1500.5', 'JPY')).toBe(false);

      expect(isValidMinorUnitsAmount('1500', 'THB')).toBe(true);
      expect(isValidMinorUnitsAmount('1500.5', 'THB')).toBe(true);
      expect(isValidMinorUnitsAmount('1500.50', 'THB')).toBe(true);
      expect(isValidMinorUnitsAmount('1500.555', 'THB')).toBe(false);
    });
  });
});
