import {
  calculateBookingTotal,
  calculateOptionPrice,
  calculateRentalPrice,
} from '../../../core';
import type { EntityManager } from 'typeorm';
import { AdditionalCharge } from '../../../modules/bookings/entities/additional-charge.entity';
import { Booking } from '../../../modules/bookings/entities/booking.entity';
import { BookingOption } from '../../../modules/bookings/entities/booking-option.entity';
import { AdditionalChargeType } from '../../../modules/bookings/enums/additional-charge-type.enum';
import { BookingStatus } from '../../../modules/bookings/enums/booking-status.enum';
import { insertMissing } from './insert-missing';
import { branches, offers, seedId } from './seed-data';

const day = 86_400_000;
const at = (offset: number) =>
  new Date(Date.now() + offset * day).toISOString();
type BookingFixture = {
  status: BookingStatus;
  offer: number;
  pickup: number;
  return: number;
  option?: number;
  actualReturn?: number;
  cancellationReason?: string;
  rejectionReason?: string;
};
const bookingFixtures: BookingFixture[] = [
  { status: BookingStatus.PENDING, offer: 2, pickup: 1, return: 2, option: 2 },
  { status: BookingStatus.APPROVED, offer: 2, pickup: 3, return: 4, option: 2 },
  {
    status: BookingStatus.IN_USE,
    offer: 1,
    pickup: -1 / 24,
    return: 1,
    option: 1,
  },
  {
    status: BookingStatus.COMPLETED,
    offer: 1,
    pickup: -5,
    return: -3,
    actualReturn: -3 + 2 / 24,
    option: 1,
  },
  {
    status: BookingStatus.CANCELLED,
    offer: 1,
    pickup: 5,
    return: 6,
    cancellationReason: 'Customer cancelled before pickup',
  },
  {
    status: BookingStatus.REJECTED,
    offer: 2,
    pickup: 6,
    return: 7,
    rejectionReason: 'Capacity unavailable',
  },
];

export async function seedBookings(manager: EntityManager): Promise<void> {
  const bookings = bookingFixtures.map((fixture, index) => {
    const offer = offers[fixture.offer - 1];
    const branch = branches.find(({ id }) => id === offer.branchId)!;
    const pickupAt = at(fixture.pickup);
    const returnAt = at(fixture.return);
    const rental = calculateRentalPrice({
      pickupAt,
      returnAt,
      branchTimeZone: branch.timezone,
      hourlyRate: { amount: offer.hourlyRate, currency: offer.currency },
      dailyRate: { amount: offer.dailyRate, currency: offer.currency },
    });
    const option = fixture.option
      ? {
          id: seedId(7, fixture.option),
          price: fixture.option === 1 ? '100.00' : '5.00',
        }
      : null;
    const optionPrice = option
      ? calculateOptionPrice({
          pickupAt,
          returnAt,
          pricingType: 'PER_UNIT_PER_DAY',
          unitPrice: { amount: option.price, currency: offer.currency },
          quantity: 1,
        })
      : null;
    const total = calculateBookingTotal({
      rentalPrice: rental.rentalSubtotal,
      optionPrices: optionPrice ? [optionPrice.totalAmount] : [],
    });

    return {
      id: seedId(8, index + 1),
      bookingNumber: `DEMO-${String(index + 1).padStart(3, '0')}`,
      checkoutKey: seedId(11, index + 1),
      userId: seedId(6, 1),
      carTypeBranchId: offer.id,
      carId:
        fixture.status === BookingStatus.IN_USE ||
        fixture.status === BookingStatus.COMPLETED
          ? seedId(5, fixture.offer)
          : null,
      pickupBranchId: branch.id,
      returnBranchId: branch.id,
      pickupAt: new Date(pickupAt),
      returnAt: new Date(returnAt),
      actualReturnAt: fixture.actualReturn
        ? new Date(at(fixture.actualReturn))
        : null,
      status: fixture.status,
      currencyCode: offer.currency,
      dailyRateAtBooking: offer.dailyRate,
      hourlyRateAtBooking: offer.hourlyRate,
      chargedDays: rental.chargedDays,
      chargedHours: rental.chargedHours,
      rentalSubtotal: total.rentalSubtotal.amount,
      optionsSubtotal: total.optionsSubtotal.amount,
      totalAmount: total.totalAmount.amount,
      approvedBy:
        fixture.status === BookingStatus.APPROVED ||
        fixture.status === BookingStatus.IN_USE ||
        fixture.status === BookingStatus.COMPLETED
          ? seedId(6, 2)
          : null,
      approvedAt:
        fixture.status === BookingStatus.APPROVED ||
        fixture.status === BookingStatus.IN_USE ||
        fixture.status === BookingStatus.COMPLETED
          ? new Date()
          : null,
      rejectionReason: fixture.rejectionReason ?? null,
      cancellationReason: fixture.cancellationReason ?? null,
      option,
      optionPrice,
    };
  });

  await insertMissing(
    manager.getRepository(Booking),
    bookings.map((booking) => {
      const { option: _1, optionPrice: _2, ...rest } = booking;
      void _1;
      void _2;
      return rest;
    }),
  );

  for (const [index, booking] of bookings.entries()) {
    if (booking.option && booking.optionPrice)
      await insertMissing(manager.getRepository(BookingOption), [
        {
          id: seedId(9, index + 1),
          bookingId: booking.id,
          carOptionId: booking.option.id,
          quantity: 1,
          unitPriceAtBooking: booking.option.price,
          chargedUnits: booking.optionPrice.chargedUnits,
          totalAmount: booking.optionPrice.totalAmount.amount,
        },
      ]);
  }

  await insertMissing(manager.getRepository(AdditionalCharge), [
    {
      id: seedId(10, 1),
      bookingId: seedId(8, 4),
      bookingOptionId: null,
      type: AdditionalChargeType.DAMAGE,
      description: 'Demo confirmed damage charge',
      quantity: 1,
      unitPrice: '250.00',
      amount: '250.00',
      status: 'CONFIRMED',
      createdBy: seedId(6, 2),
    },
  ]);
}
