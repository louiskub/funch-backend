import type { UserRole } from '../enums/user-role.enum';
export { UserRole } from '../enums/user-role.enum';

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
