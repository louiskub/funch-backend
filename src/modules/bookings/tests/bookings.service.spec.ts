import { ConflictException, ForbiddenException } from '@nestjs/common';
import { types } from 'pg';
import type { EntityManager } from 'typeorm';
import { BookingsService } from '../bookings.service';
import { Booking } from '../entities/booking.entity';
import { BookingOption } from '../entities/booking-option.entity';
import { BookingRevision } from '../entities/booking-revision.entity';
import { BookingStatus } from '../enums/booking-status.enum';
import { UserRole } from '../../auth/enums/user-role.enum';
import type { AuthUser } from '../../auth/types/auth.types';
import { Car } from '../../admin-fleet/entities/car.entity';
import { CarTypeBranch } from '../../admin-fleet/entities/car-type-branch.entity';
import { CarOption } from '../../options/entities/car-option.entity';

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
    const txService = Object.create(
      BookingsService.prototype,
    ) as BookingsService;
    Object.assign(txService, {
      db: {
        transaction: (cb: (m: EntityManager) => Promise<unknown>) =>
          cb(manager as unknown as EntityManager),
      },
    });
    await expect(
      txService.markReady('b-1', {
        id: 'admin-1',
        email: 'admin@example.com',
        name: 'Admin',
        phone: '',
        role: UserRole.ADMIN,
        isSuspended: false,
      }),
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
    const txService = Object.create(
      BookingsService.prototype,
    ) as BookingsService;
    Object.assign(txService, {
      db: {
        transaction: (cb: (m: EntityManager) => Promise<unknown>) =>
          cb(manager as unknown as EntityManager),
      },
    });
    const result = await txService.markReady('b-1', {
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      phone: '',
      role: UserRole.ADMIN,
      isSuspended: false,
    });
    expect(result.id).toBe('b-1');
    expect(result.carId).toBe('c-1');
    expect(result.readyBy).toBe('admin-1');
    expect(result.readyAt).toBeDefined();
    expect(updateFn).toHaveBeenCalledWith(
      { id: 'b-1' },
      expect.objectContaining({ readyBy: 'admin-1' }),
    );
  });

  describe('customer booking edits', () => {
    const editInput = {
      pickupAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      returnAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      options: [],
    };
    const customer: AuthUser = {
      id: 'customer-1',
      email: 'customer@example.com',
      name: 'Customer',
      phone: '',
      role: UserRole.CUSTOMER,
      isSuspended: false,
    };

    it('does not preview a booking owned by another customer', async () => {
      const query = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          id: 'booking-1',
          userId: 'customer-2',
        }),
      };
      const txService = Object.create(
        BookingsService.prototype,
      ) as BookingsService;
      Object.assign(txService, {
        bookingRepo: { createQueryBuilder: () => query },
      });

      await expect(
        txService.previewEdit('booking-1', editInput, customer),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(query.getRawOne).toHaveBeenCalledTimes(1);
    });

    it('does not preview a booking after pickup has started', async () => {
      const query = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          id: 'booking-1',
          userId: customer.id,
          status: BookingStatus.IN_USE,
          pickupAt: new Date(Date.now() - 60_000),
        }),
      };
      const txService = Object.create(
        BookingsService.prototype,
      ) as BookingsService;
      Object.assign(txService, {
        bookingRepo: { createQueryBuilder: () => query },
      });

      await expect(
        txService.previewEdit('booking-1', editInput, customer),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('previews the revised price without mutating the booking and excludes itself from capacity', async () => {
      const makeQuery = (rawOne?: unknown, rawMany: unknown[] = []) => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue(rawOne),
        getRawMany: jest.fn().mockResolvedValue(rawMany),
      });
      const bookingRow = {
        id: 'booking-1',
        bookingNumber: 'FUNCH-1',
        userId: customer.id,
        carTypeBranchId: 'offer-1',
        status: BookingStatus.APPROVED,
        pickupAt: new Date('2030-01-01T03:00:00Z'),
        returnAt: new Date('2030-01-02T03:00:00Z'),
        currencyCode: 'THB',
        dailyRateAtBooking: '1000',
        hourlyRateAtBooking: '100',
        chargedDays: 1,
        chargedHours: 0,
        rentalSubtotal: '1000',
        optionsSubtotal: '50',
        totalAmount: '1050',
        paidAmount: '1050',
        approvedBy: 'admin-1',
        approvedAt: new Date('2029-12-01T00:00:00Z'),
      };
      const editableBookingQuery = makeQuery(bookingRow);
      const vehicleReservationsQuery = makeQuery(undefined);
      const optionRowsQuery = makeQuery(undefined, [
        {
          id: 'option-1',
          name: 'Child seat',
          pricingType: 'PER_DAY',
          quantityStock: 1,
          price: '100',
          currency: 'THB',
          isActive: true,
        },
      ]);
      const optionSelectionQuery = makeQuery(undefined, [
        {
          id: 'booking-option-1',
          carOptionId: 'old-option',
          name: 'Saved seat',
          quantity: 1,
          unitPriceAtBooking: '50',
          chargedUnits: 1,
          totalAmount: '50',
          isActive: false,
        },
      ]);
      const optionReservationsQuery = makeQuery(undefined, []);
      const revisionQuery = makeQuery({ revisionNumber: 0 });
      const offerQuery = makeQuery({
        id: 'offer-1',
        branchId: 'branch-1',
        hourly: '100',
        daily: '1000',
        currency: 'THB',
        supportedOptionIds: ['option-1', 'old-option'],
        timezone: 'Asia/Bangkok',
      });
      const carQuery = makeQuery({ count: 1 });
      const bookingQueries = [editableBookingQuery, vehicleReservationsQuery];
      const optionQueries = [optionSelectionQuery, optionReservationsQuery];
      const repositories = new Map<
        unknown,
        { createQueryBuilder: () => unknown }
      >([
        [Booking, { createQueryBuilder: () => bookingQueries.shift() }],
        [BookingOption, { createQueryBuilder: () => optionQueries.shift() }],
        [BookingRevision, { createQueryBuilder: () => revisionQuery }],
        [CarTypeBranch, { createQueryBuilder: () => offerQuery }],
        [CarOption, { createQueryBuilder: () => optionRowsQuery }],
        [Car, { createQueryBuilder: () => carQuery }],
      ]);
      const manager = {
        getRepository: (entity: unknown) => repositories.get(entity),
      };
      const txService = Object.create(
        BookingsService.prototype,
      ) as BookingsService;
      Object.assign(txService, {
        bookingRepo: repositories.get(Booking),
        bookingOptionRepo: repositories.get(BookingOption),
        bookingRevisionRepo: repositories.get(BookingRevision),
        offerRepo: repositories.get(CarTypeBranch),
        carOptionRepo: repositories.get(CarOption),
        carRepo: repositories.get(Car),
        db: { manager },
      });

      const result = await txService.previewEdit(
        'booking-1',
        {
          pickupAt: '2030-02-01T10:00:00+07:00',
          returnAt: '2030-02-02T10:00:00+07:00',
          options: [
            { carOptionId: 'option-1', quantity: 1 },
            { carOptionId: 'old-option', quantity: 1 },
          ],
        },
        customer,
      );

      expect(result).toMatchObject({
        status: BookingStatus.APPROVED,
        totalAmount: '1100',
        amountDelta: '50',
        amountDue: '50',
        paidAmount: '1050',
        removedOptions: [{ carOptionId: 'old-option', name: 'Saved seat' }],
      });
      expect(vehicleReservationsQuery.andWhere).toHaveBeenCalledWith(
        'b.id <> :excludeId',
        { excludeId: 'booking-1' },
      );
      expect(optionReservationsQuery.andWhere).toHaveBeenCalledWith(
        'b.id <> :excludeBookingId',
        { excludeBookingId: 'booking-1' },
      );
      expect(repositories.get(Booking)).not.toHaveProperty('update');
      expect(repositories.get(BookingRevision)).not.toHaveProperty('insert');
    });

    it('rejects a confirmation based on an outdated revision before locking inventory', async () => {
      const bookingQuery = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          id: 'booking-1',
          bookingNumber: 'FUNCH-1',
          userId: customer.id,
          carTypeBranchId: 'offer-1',
          status: BookingStatus.APPROVED,
          pickupAt: editInput.pickupAt,
          returnAt: editInput.returnAt,
          currencyCode: 'THB',
          dailyRateAtBooking: '1000',
          hourlyRateAtBooking: '100',
          chargedDays: 1,
          chargedHours: 0,
          rentalSubtotal: '1000',
          optionsSubtotal: '0',
          totalAmount: '1000',
          paidAmount: '1000',
          approvedBy: 'admin-1',
          approvedAt: new Date(),
        }),
      };
      const revisionQuery = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ revisionNumber: 1 }),
      };
      const offerQuery = {
        createQueryBuilder: jest.fn(),
      };
      const manager = {
        getRepository: (entity: unknown) =>
          entity === Booking
            ? { createQueryBuilder: () => bookingQuery }
            : { createQueryBuilder: () => revisionQuery },
      };
      const txService = Object.create(
        BookingsService.prototype,
      ) as BookingsService;
      Object.assign(txService, {
        db: {
          transaction: (callback: (value: unknown) => unknown) =>
            callback(manager),
        },
        offerRepo: offerQuery,
      });

      await expect(
        txService.confirmEdit(
          'booking-1',
          {
            ...editInput,
            expectedRevisionNumber: 0,
            expectedTotalAmount: '1000',
            expectedOptions: [],
          },
          customer,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(offerQuery.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('updates an approved booking to pending and records the paid revision atomically', async () => {
      const makeQuery = (rawOne?: unknown, rawMany: unknown[] = []) => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue(rawOne),
        getRawMany: jest.fn().mockResolvedValue(rawMany),
      });
      const bookingRow = {
        id: 'booking-1',
        bookingNumber: 'FUNCH-1',
        userId: customer.id,
        carTypeBranchId: 'offer-1',
        status: BookingStatus.APPROVED,
        pickupAt: new Date('2030-01-01T03:00:00Z'),
        returnAt: new Date('2030-01-02T03:00:00Z'),
        currencyCode: 'THB',
        dailyRateAtBooking: '1000',
        hourlyRateAtBooking: '100',
        chargedDays: 1,
        chargedHours: 0,
        rentalSubtotal: '1000',
        optionsSubtotal: '50',
        totalAmount: '1050',
        paidAmount: '1050',
        approvedBy: 'admin-1',
        approvedAt: new Date('2029-12-01T00:00:00Z'),
      };
      const editableBookingQuery = makeQuery(bookingRow);
      const vehicleReservationsQuery = makeQuery(undefined);
      const optionSelectionQuery = makeQuery(undefined, [
        {
          id: 'booking-option-1',
          carOptionId: 'old-option',
          name: 'Saved seat',
          quantity: 1,
          unitPriceAtBooking: '50',
          chargedUnits: 1,
          totalAmount: '50',
          isActive: false,
        },
      ]);
      const optionReservationsQuery = makeQuery(undefined, []);
      const revisionNumberQuery = makeQuery({ revisionNumber: 2 });
      const optionLockQuery = makeQuery(undefined, []);
      const quotedOptionsQuery = makeQuery(undefined, [
        {
          id: 'option-1',
          name: 'Child seat',
          pricingType: 'PER_DAY',
          quantityStock: 1,
          price: '100',
          currency: 'THB',
          isActive: true,
        },
      ]);
      const lockedOfferQuery = makeQuery({ id: 'offer-1' });
      const quotedOfferQuery = makeQuery({
        id: 'offer-1',
        branchId: 'branch-1',
        hourly: '100',
        daily: '1000',
        currency: 'THB',
        supportedOptionIds: ['option-1'],
        timezone: 'Asia/Bangkok',
      });
      const carQuery = makeQuery({ count: 1 });
      const updateBooking = jest.fn().mockResolvedValue({ affected: 1 });
      const insertRevision = jest.fn().mockResolvedValue(undefined);
      const insertOption = jest.fn().mockResolvedValue(undefined);
      const deleteOption = jest.fn().mockResolvedValue({ affected: 1 });
      const bookingQueries = [editableBookingQuery, vehicleReservationsQuery];
      const offerQueries = [lockedOfferQuery, quotedOfferQuery];
      const optionQueries = [optionLockQuery, quotedOptionsQuery];
      const bookingOptionQueries = [
        optionSelectionQuery,
        optionReservationsQuery,
      ];
      const repositories = new Map<unknown, unknown>([
        [
          Booking,
          {
            createQueryBuilder: () => bookingQueries.shift(),
            update: updateBooking,
          },
        ],
        [
          BookingOption,
          {
            createQueryBuilder: () => bookingOptionQueries.shift(),
            insert: insertOption,
            delete: deleteOption,
          },
        ],
        [
          BookingRevision,
          {
            createQueryBuilder: () => revisionNumberQuery,
            insert: insertRevision,
          },
        ],
        [CarTypeBranch, { createQueryBuilder: () => offerQueries.shift() }],
        [CarOption, { createQueryBuilder: () => optionQueries.shift() }],
        [Car, { createQueryBuilder: () => carQuery }],
      ]);
      const manager = {
        getRepository: (entity: unknown) => repositories.get(entity),
      };
      const txService = Object.create(
        BookingsService.prototype,
      ) as BookingsService;
      Object.assign(txService, {
        db: {
          transaction: (callback: (value: unknown) => unknown) =>
            callback(manager),
        },
      });

      const result = await txService.confirmEdit(
        'booking-1',
        {
          pickupAt: '2030-02-01T10:00:00+07:00',
          returnAt: '2030-02-02T10:00:00+07:00',
          options: [
            { carOptionId: 'option-1', quantity: 1 },
            { carOptionId: 'old-option', quantity: 1 },
          ],
          expectedRevisionNumber: 2,
          expectedTotalAmount: '1100.00',
          expectedOptions: [{ carOptionId: 'option-1', quantity: 1 }],
        },
        customer,
      );

      expect(result).toMatchObject({
        status: BookingStatus.PENDING,
        revisionNumber: 3,
        totalAmount: '1100',
        paidAmount: '1100',
      });
      expect(updateBooking).toHaveBeenCalledWith(
        { id: 'booking-1' },
        expect.objectContaining({
          status: BookingStatus.PENDING,
          approvedBy: null,
          approvedAt: null,
          paidAmount: '1100',
        }),
      );
      expect(insertRevision).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingId: 'booking-1',
          revisionNumber: 3,
          amountDelta: '50',
          beforeState: expect.objectContaining({
            status: BookingStatus.APPROVED,
            approvedBy: 'admin-1',
            options: [expect.objectContaining({ carOptionId: 'old-option' })],
          }),
          afterState: expect.objectContaining({
            status: BookingStatus.PENDING,
            approvedBy: null,
            options: [expect.objectContaining({ carOptionId: 'option-1' })],
          }),
        }),
      );
      expect(insertOption).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingId: 'booking-1',
          carOptionId: 'option-1',
          unitPriceAtBooking: '100',
          totalAmount: '100',
        }),
      );
      expect(deleteOption).toHaveBeenCalledWith(['booking-option-1']);
    });
  });
});
