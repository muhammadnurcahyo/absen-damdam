
export enum UserRole {
  OWNER = 'OWNER',
  EMPLOYEE = 'EMPLOYEE'
}

export interface User {
  id: string;
  name: string;
  username: string;
  password?: string;
  role: UserRole;
  gapok: number; // Monthly basic salary
  uangMakan: number; // Monthly meal allowance
  isActive: boolean;
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  clockIn: string | null;
  clockOut: string | null;
  latitude: number;
  longitude: number;
  status: 'PRESENT' | 'LEAVE' | 'ABSENT';
  isLate?: boolean;
}

export interface LeaveRequest {
  id: string;
  userId: string;
  date: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface OutletConfig {
  latitude: number;
  longitude: number;
  radius: number; // In meters
  clockInTime: string; // HH:mm format
  clockOutTime: string; // HH:mm format
}

export interface PayrollReport {
  userId: string;
  userName: string;
  weekStartDate: string;
  weekEndDate: string;
  totalPresent: number;
  totalLeave: number;
  excessLeaveCount: number;
  grossSalary: number;
  deductions: number;
  bonus: number;
  manualDeduction: number;
  netSalary: number;
  dailyRate: number;
}
