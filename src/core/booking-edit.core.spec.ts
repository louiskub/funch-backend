import { calculateBookingEditAmounts } from './booking-edit.core';

describe('calculateBookingEditAmounts', () => {
  it('charges only the increase beyond the current same-booking credit', () => {
    expect(
      calculateBookingEditAmounts({
        currentTotal: '1000',
        paidAmount: '1100',
        nextTotal: '1200',
      }),
    ).toEqual({
      amountDelta: '200',
      amountDue: '100',
      creditUsed: '100',
      nextPaidAmount: '1200',
      remainingCredit: '0',
    });
  });

  it('keeps the overpayment as same-booking credit when the price decreases', () => {
    expect(
      calculateBookingEditAmounts({
        currentTotal: '1000',
        paidAmount: '1000',
        nextTotal: '900',
      }),
    ).toEqual({
      amountDelta: '-100',
      amountDue: '0',
      creditUsed: '0',
      nextPaidAmount: '1000',
      remainingCredit: '100',
    });
  });

  it('does not change payment or credit when the agreed price is unchanged', () => {
    expect(
      calculateBookingEditAmounts({
        currentTotal: '1000.25',
        paidAmount: '1000.25',
        nextTotal: '1000.25',
      }),
    ).toEqual({
      amountDelta: '0',
      amountDue: '0',
      creditUsed: '0',
      nextPaidAmount: '1000.25',
      remainingCredit: '0',
    });
  });
});
