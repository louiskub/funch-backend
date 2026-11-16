import type { BookingStatus, IsoInstant, PolicyDecision } from './core.types';
import { parseIsoInstant } from './time.core';

function decision(allowed: boolean, reason: string): PolicyDecision {
  return allowed ? { allowed: true, reason: null } : { allowed: false, reason };
}

export interface CalculateReadyAtInput {
  returnAt: IsoInstant;
  actualReturnAt: IsoInstant | null;
  readyAt?: IsoInstant | null;
  now?: IsoInstant;
}

export interface CalculateReadyAtResult {
  readyAt: IsoInstant;
}

export function calculateReadyAt(
  input: CalculateReadyAtInput,
): CalculateReadyAtResult {
  if (input.readyAt) {
    return {
      readyAt: parseIsoInstant(input.readyAt)
        .toUTC()
        .toISO({ suppressMilliseconds: true })!,
    };
  }

  if (input.actualReturnAt !== null) {
    return {
      readyAt: parseIsoInstant(input.actualReturnAt)
        .plus({ hours: 1 })
        .toUTC()
        .toISO({ suppressMilliseconds: true })!,
    };
  }

  const scheduledReady = parseIsoInstant(input.returnAt).plus({ hours: 2 });
  if (input.now) {
    const rollingReady = parseIsoInstant(input.now).plus({ hours: 2 });
    if (rollingReady > scheduledReady) {
      return {
        readyAt: rollingReady.toUTC().toISO({ suppressMilliseconds: true })!,
      };
    }
  }

  return {
    readyAt: scheduledReady.toUTC().toISO({ suppressMilliseconds: true })!,
  };
}

export interface ReservedInterval {
  startsAt: IsoInstant;
  endsAt: IsoInstant;
  quantity: number;
}

export interface CalculateAvailableQuantityInput {
  requestedInterval: {
    startsAt: IsoInstant;
    endsAt: IsoInstant;
  };
  capacity: number;
  reservedIntervals: ReservedInterval[];
}

export interface CalculateAvailableQuantityResult {
  availableQuantity: number;
  shortfallQuantity: number;
  peakReserved: number;
}

export function calculateAvailableQuantity(
  input: CalculateAvailableQuantityInput,
): CalculateAvailableQuantityResult {
  const requestedStart = parseIsoInstant(
    input.requestedInterval.startsAt,
  ).toMillis();
  const requestedEnd = parseIsoInstant(
    input.requestedInterval.endsAt,
  ).toMillis();
  if (requestedEnd <= requestedStart)
    throw new RangeError('Requested interval must have positive duration');
  if (!Number.isSafeInteger(input.capacity) || input.capacity < 0)
    throw new RangeError('Capacity must be a non-negative safe integer');

  const events: { at: number; quantity: number }[] = [];
  for (const interval of input.reservedIntervals) {
    const start = parseIsoInstant(interval.startsAt).toMillis();
    const end = parseIsoInstant(interval.endsAt).toMillis();
    if (end <= start)
      throw new RangeError('Reserved interval must have positive duration');
    if (!Number.isSafeInteger(interval.quantity) || interval.quantity < 0)
      throw new RangeError(
        'Reserved quantity must be a non-negative safe integer',
      );

    const overlapStart = Math.max(start, requestedStart);
    const overlapEnd = Math.min(end, requestedEnd);
    if (overlapStart < overlapEnd && interval.quantity > 0) {
      events.push(
        { at: overlapStart, quantity: interval.quantity },
        { at: overlapEnd, quantity: -interval.quantity },
      );
    }
  }

  events.sort((a, b) => a.at - b.at || a.quantity - b.quantity);
  let reserved = 0;
  let peakReserved = 0;
  for (const event of events) {
    reserved += event.quantity;
    peakReserved = Math.max(peakReserved, reserved);
  }
  const shortfallQuantity = Math.max(0, peakReserved - input.capacity);
  return {
    availableQuantity: Math.max(0, input.capacity - peakReserved),
    shortfallQuantity,
    peakReserved,
  };
}

export interface CanCancelBookingInput {
  actor: {
    role: 'CUSTOMER' | 'ADMIN';
    userId: string;
  };
  booking: {
    customerId: string;
    status: BookingStatus;
    pickupAt: IsoInstant;
  };
  now: IsoInstant;
  cancellationReason: string | null;
}

export function canCancelBooking(input: CanCancelBookingInput): PolicyDecision {
  const now = parseIsoInstant(input.now).toMillis();
  const pickupAt = parseIsoInstant(input.booking.pickupAt).toMillis();
  if (input.booking.status !== 'PENDING' && input.booking.status !== 'APPROVED')
    return decision(
      false,
      'Only pending or approved bookings can be cancelled',
    );
  if (input.actor.role === 'CUSTOMER') {
    if (input.actor.userId !== input.booking.customerId)
      return decision(false, 'Customers can only cancel their own bookings');
    if (now >= pickupAt)
      return decision(
        false,
        'Customer cancellation must be before pickup time',
      );
    return decision(true, '');
  }
  if (input.actor.role === 'ADMIN') {
    if (!input.cancellationReason?.trim())
      return decision(false, 'Admin cancellation requires a reason');
    return decision(true, '');
  }
  return decision(false, 'Unsupported actor role');
}

export interface CanAssignCarInput {
  booking: {
    status: BookingStatus;
    pickupAt: IsoInstant;
    carTypeBranchId: string;
  };
  car: {
    carTypeBranchId: string;
    isOperational: boolean;
    isOutOnRent: boolean;
    readyAt: IsoInstant;
  };
  now: IsoInstant;
}

export function canAssignCar(input: CanAssignCarInput): PolicyDecision {
  const now = parseIsoInstant(input.now).toMillis();
  if (input.booking.status !== 'APPROVED')
    return decision(false, 'Only approved bookings can be assigned a car');
  if (now < parseIsoInstant(input.booking.pickupAt).toMillis())
    return decision(false, 'Car cannot be assigned before pickup time');
  if (input.booking.carTypeBranchId !== input.car.carTypeBranchId)
    return decision(false, 'Car must belong to the booked branch and car type');
  if (!input.car.isOperational)
    return decision(false, 'Car is not operational');
  if (input.car.isOutOnRent) return decision(false, 'Car is still out on rent');
  if (now < parseIsoInstant(input.car.readyAt).toMillis())
    return decision(false, 'Car has not completed its cooldown');
  return decision(true, '');
}
