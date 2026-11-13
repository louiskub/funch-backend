export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  ADMIN = 'ADMIN',
}

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: UserRole;
  isSuspended: boolean;
};

import type { Request } from 'express';

export type AuthenticatedRequest = Request & { authUser?: AuthUser };
