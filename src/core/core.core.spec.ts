import {
  calculateAvailableQuantity,
  calculateBookingTotal,
  calculateLateReturnCharges,
  calculateOptionPrice,
  calculateReadyAt,
  calculateRentalPrice,
  canAssignCar,
  canCancelBooking,
  summarizeBookings,
} from './index';

describe('core business stubs', () => {
  it('throws an explicit not-implemented error for every exported core function', () => {
    const money = { amount: '100.00', currency: 'THB' };

    expect(() =>
      calculateRentalPrice({
        pickupAt: '2026-11-14T10:00:00+07:00',
        returnAt: '2026-11-15T10:00:00+07:00',
        branchTimeZone: 'Asia/Bangkok',
        hourlyRate: money,
        dailyRate: money,
      }),
    ).toThrow('Not implemented: calculateRentalPrice (BL-01)');
    expect(() =>
      calculateOptionPrice({
        pickupAt: '2026-11-14T10:00:00+07:00',
        returnAt: '2026-11-15T10:00:00+07:00',
        pricingType: 'PER_UNIT_PER_DAY',
        unitPrice: money,
        quantity: 1,
      }),
    ).toThrow('Not implemented: calculateOptionPrice (BL-02)');
    expect(() =>
      calculateBookingTotal({ rentalPrice: money, optionPrices: [money] }),
    ).toThrow('Not implemented: calculateBookingTotal (BL-03)');
    expect(() =>
      calculateLateReturnCharges({
        pickupAt: '2026-11-14T10:00:00+07:00',
        returnAt: '2026-11-15T10:00:00+07:00',
        actualReturnAt: '2026-11-15T11:00:00+07:00',
        branchTimeZone: 'Asia/Bangkok',
        hourlyRate: money,
        dailyRate: money,
        rentalSubtotal: money,
        options: [],
      }),
    ).toThrow('Not implemented: calculateLateReturnCharges (BL-04)');
    expect(() =>
      calculateReadyAt({
        returnAt: '2026-11-15T10:00:00+07:00',
        actualReturnAt: null,
      }),
    ).toThrow('Not implemented: calculateReadyAt (BL-05)');
    expect(() =>
      calculateAvailableQuantity({
        requestedInterval: {
          startsAt: '2026-11-14T10:00:00+07:00',
          endsAt: '2026-11-15T10:00:00+07:00',
        },
        capacity: 2,
        reservedIntervals: [],
      }),
    ).toThrow('Not implemented: calculateAvailableQuantity (BL-06)');
    expect(() =>
      canCancelBooking({
        actor: { role: 'CUSTOMER', userId: 'user-1' },
        booking: {
          customerId: 'user-1',
          status: 'PENDING',
          pickupAt: '2026-11-15T10:00:00+07:00',
        },
        now: '2026-11-14T10:00:00+07:00',
        cancellationReason: null,
      }),
    ).toThrow('Not implemented: canCancelBooking (BL-07)');
    expect(() =>
      canAssignCar({
        booking: {
          status: 'APPROVED',
          pickupAt: '2026-11-15T10:00:00+07:00',
          carTypeBranchId: 'offer-1',
        },
        car: {
          carTypeBranchId: 'offer-1',
          isOperational: true,
          readyAt: '2026-11-15T09:00:00+07:00',
        },
        now: '2026-11-15T10:00:00+07:00',
      }),
    ).toThrow('Not implemented: canAssignCar (BL-08)');
    expect(() =>
      summarizeBookings({
        createdFrom: '2026-11-01T00:00:00Z',
        createdTo: '2026-12-01T00:00:00Z',
        bookings: [],
      }),
    ).toThrow('Not implemented: summarizeBookings (BL-09)');
  });
});
