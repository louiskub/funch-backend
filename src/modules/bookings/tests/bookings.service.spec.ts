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

  it('rejects markReady if the car has not been physically returned', async () => {
    const txBookingQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        id: 'b-1',
        carId: 'c-1',
        actualReturnAt: null,
      }),
    };
    const manager = {
      getRepository: () => ({
        createQueryBuilder: () => txBookingQuery,
      }),
    };
    const txService = Object.create(BookingsService.prototype) as BookingsService;
    Object.assign(txService, {
      db: { transaction: (cb: (m: any) => any) => cb(manager) },
    });
    await expect(
      txService.markReady('b-1', { id: 'admin-1', role: 'ADMIN' } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates readyAt and returns readiness on markReady when returned', async () => {
    const updateFn = jest.fn().mockResolvedValue({ affected: 1 });
    const txBookingQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        id: 'b-1',
        carId: 'c-1',
        actualReturnAt: '2026-11-16T10:00:00Z',
      }),
    };
    const manager = {
      getRepository: () => ({
        createQueryBuilder: () => txBookingQuery,
        update: updateFn,
      }),
    };
    const txService = Object.create(BookingsService.prototype) as BookingsService;
    Object.assign(txService, {
      db: { transaction: (cb: (m: any) => any) => cb(manager) },
    });
    const result = await txService.markReady('b-1', {
      id: 'admin-1',
      role: 'ADMIN',
    } as any);
    expect(result.id).toBe('b-1');
    expect(result.carId).toBe('c-1');
    expect(result.readyBy).toBe('admin-1');
    expect(result.readyAt).toBeDefined();
    expect(updateFn).toHaveBeenCalledWith(
      { id: 'b-1' },
      expect.objectContaining({ readyBy: 'admin-1' }),
    );
  });
});
