
import { User, AttendanceRecord, PayrollReport } from '../types';
import { DAYS_IN_MONTH, FREE_LEAVE_QUOTA } from '../constants';

export const calculateWeeklyPayroll = (
  user: User,
  records: AttendanceRecord[],
  allRecordsThisMonth: AttendanceRecord[],
  weekStart: Date,
  weekEnd: Date,
  bonus: number = 0,
  manualDeduction: number = 0
): PayrollReport => {
  const dailyGapok = user.gapok / DAYS_IN_MONTH;
  const dailyUangMakan = user.uangMakan / DAYS_IN_MONTH;
  const dailyRateTotal = dailyGapok + dailyUangMakan;
  
  const weekRecords = records.filter(r => {
    const d = new Date(r.date);
    return d >= weekStart && d <= weekEnd;
  });

  const presentCount = weekRecords.filter(r => r.status === 'PRESENT').length;
  const leaveCount = weekRecords.filter(r => r.status === 'LEAVE').length;

  let excessLeaveCount = 0;
  let runningLeaveCount = 0;
  
  const sortedMonthRecords = [...allRecordsThisMonth].sort((a, b) => a.date.localeCompare(b.date));
  
  sortedMonthRecords.forEach(r => {
    if (r.status === 'LEAVE') {
      runningLeaveCount++;
      const rDate = new Date(r.date);
      if (runningLeaveCount > FREE_LEAVE_QUOTA && rDate >= weekStart && rDate <= weekEnd) {
        excessLeaveCount++;
      }
    }
  });

  const weeklyBase = dailyRateTotal * 7;
  const deductionForExcessLeave = excessLeaveCount * dailyRateTotal;
  
  const totalSlots = 7;
  const recordedCount = presentCount + leaveCount;
  const absentCount = Math.max(0, totalSlots - recordedCount);
  const absenceDeduction = absentCount * dailyRateTotal;

  const totalDeductions = deductionForExcessLeave + absenceDeduction + manualDeduction;
  const netSalary = Math.max(0, weeklyBase + bonus - totalDeductions);

  return {
    userId: user.id,
    userName: user.name,
    weekStartDate: weekStart.toISOString().split('T')[0],
    weekEndDate: weekEnd.toISOString().split('T')[0],
    totalPresent: presentCount,
    totalLeave: leaveCount,
    excessLeaveCount,
    grossSalary: weeklyBase,
    bonus,
    manualDeduction,
    deductions: totalDeductions,
    netSalary: netSalary
  };
};
