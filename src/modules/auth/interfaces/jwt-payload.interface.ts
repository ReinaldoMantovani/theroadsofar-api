import { UserRole } from '../../users/entities/user.entity';

export interface JwtPayload {
  sub: number;        // userId
  email: string;
  roles: UserRole[];
  displayName: string;
  avatarUrl: string | null;
  iat?: number;
  exp?: number;
}
