
export enum UserRole {
  OWNER = 'OWNER',
  EMPLOYEE = 'EMPLOYEE'
}

export enum PayrollMethod {
  DAILY_30 = 'DAILY_30',
  FIXED_4 = 'FIXED_4'
}

export interface User {
  id: string;
  name: string;
  username: string;
  password?: string;
  role: UserRole;
  gapok: number;
  uangMakan: number;
  deductionRate?: number;
  payrollMethod: PayrollMethod;
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
  status: 'PRESENT' | 'LEAVE' | 'ABSENT' | 'LEAVE_PENDING';
  isLate?: boolean;
  leaveRequestId?: string;
}

export interface LeaveRequest {
  id: string;
  userId: string;
  date: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  evidencePhoto?: string;
}

export interface OutletConfig {
  latitude: number;
  longitude: number;
  radius: number; 
  clockInTime: string; // HH:mm
  clockOutTime: string; // HH:mm
}

export interface PayrollReport {
  userId: string;
  userName: string;
  weekStartDate: string;
  weekEndDate: string;
  totalPresent: number;
  totalOnTime: number;
  totalLate: number;
  totalLeave: number;
  monthlyLeaveCount: number; // New field
  excessLeaveCount: number;
  grossSalary: number;
  deductions: number;
  bonus: number;
  manualDeduction: number;
  netSalary: number;
  dailyRate: number;
  methodLabel: string;
}
