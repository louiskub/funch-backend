import { ConflictException } from '@nestjs/common';
import { types } from 'pg';
import { BookingsService } from '../bookings.service';

describe('Booking pickup readiness response', () => {
  const bookingQuery = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(),
  };
  const carQuery = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
  };
  const service = Object.create(BookingsService.prototype) as BookingsService;
  Object.assign(service, {
    bookingRepo: { createQueryBuilder: () => bookingQuery },
    carRepo: { createQueryBuilder: () => carQuery },
  });

  it('preserves readiness through JSON for cars without history and finite cooldowns', async () => {
    bookingQuery.getRawOne.mockResolvedValue({ carTypeBranchId: 'offer' });
    const parseTimestamp: (value: string) => Date | number =
      types.getTypeParser(1184);
    const car = {
      id: 'car',
      licensePlate: 'READY-01',
      status: 'ACTIVE',
      isOutOnRent: false,
    };
    carQuery.getRawMany.mockResolvedValue([
      { ...car, readyAt: parseTimestamp('-infinity') },
      {
        ...car,
        id: 'cooldown',
        readyAt: parseTimestamp('2026-11-16 10:00:00+00'),
      },
    ]);
    const result: unknown = JSON.parse(
      JSON.stringify(await service.pickupCars('booking')),
    );
    expect(result).toEqual([
      { ...car, readyAt: '-infinity' },
      { ...car, id: 'cooldown', readyAt: '2026-11-16T10:00:00.000Z' },
    ]);
  });

  it('does not expose a car list for a booking outside the pickup stage', async () => {
    bookingQuery.getRawOne.mockResolvedValue(null);
    await expect(service.pickupCars('booking')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
