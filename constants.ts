
import { User, UserRole, OutletConfig, PayrollMethod } from './types';

export const INITIAL_OUTLET_CONFIG: OutletConfig = {
  latitude: -6.200000,
  longitude: 106.816666,
  radius: 100,
  clockInTime: '08:00',
  clockOutTime: '17:00',
};

export const MOCK_USERS: User[] = [
  { 
    id: '1', 
    name: 'Owner DamDam', 
    username: 'owner', 
    password: '123', 
    role: UserRole.OWNER, 
    gapok: 0, 
    uangMakan: 0, 
    payrollMethod: PayrollMethod.DAILY_30, 
    totalKasbon: 0,
    isActive: true 
  },
  { 
    id: '2', 
    name: 'Mba Dwi', 
    username: 'dwi', 
    password: '123', 
    role: UserRole.EMPLOYEE, 
    gapok: 1500000, 
    uangMakan: 600000, 
    deductionRate: 20000, 
    payrollMethod: PayrollMethod.FIXED_4,
    totalKasbon: 0,
    isActive: true 
  },
  { 
    id: '3', 
    name: 'Bu Mega', 
    username: 'mega', 
    password: '123', 
    role: UserRole.EMPLOYEE, 
    gapok: 1650000, 
    uangMakan: 0, 
    deductionRate: 55000, 
    payrollMethod: PayrollMethod.FIXED_4, 
    totalKasbon: 0,
    isActive: true 
  },
];

export const DAYS_IN_MONTH = 30;
export const FREE_LEAVE_QUOTA = 3;
