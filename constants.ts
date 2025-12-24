
import { User, UserRole, OutletConfig } from './types';

export const INITIAL_OUTLET_CONFIG: OutletConfig = {
  latitude: -6.200000,
  longitude: 106.816666,
  radius: 100,
};

export const MOCK_USERS: User[] = [
  { id: '1', name: 'Owner DamDam', username: 'owner', password: '123', role: UserRole.OWNER, gapok: 0, uangMakan: 0, isActive: true },
  { id: '2', name: 'Budi Laundry', username: 'budi', password: '123', role: UserRole.EMPLOYEE, gapok: 3000000, uangMakan: 500000, isActive: true },
  { id: '3', name: 'Siti Clean', username: 'siti', password: '123', role: UserRole.EMPLOYEE, gapok: 3200000, uangMakan: 600000, isActive: true },
];

export const DAYS_IN_MONTH = 30;
export const FREE_LEAVE_QUOTA = 3;
