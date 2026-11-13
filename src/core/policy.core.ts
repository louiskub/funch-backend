import type { BookingStatus, IsoInstant } from './core.types';

export interface CalculateReadyAtInput {
  returnAt: IsoInstant;
  actualReturnAt: IsoInstant | null;
}

export interface CalculateReadyAtResult {
  readyAt: IsoInstant;
}

export function calculateReadyAt(
  input: CalculateReadyAtInput,
): CalculateReadyAtResult {
  void input;
  throw new Error('Not implemented: calculateReadyAt (BL-05)');
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
}

export function calculateAvailableQuantity(
  input: CalculateAvailableQuantityInput,
): CalculateAvailableQuantityResult {
  void input;
  throw new Error('Not implemented: calculateAvailableQuantity (BL-06)');
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

export function canCancelBooking(input: CanCancelBookingInput): boolean {
  void input;
  throw new Error('Not implemented: canCancelBooking (BL-07)');
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

export function canAssignCar(input: CanAssignCarInput): boolean {
  void input;
  throw new Error('Not implemented: canAssignCar (BL-08)');
}
