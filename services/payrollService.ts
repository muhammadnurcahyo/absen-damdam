
import { User, AttendanceRecord, PayrollReport, PayrollMethod } from '../types';
import { FREE_LEAVE_QUOTA, DAYS_IN_MONTH } from '../constants';

export const calculateWeeklyPayroll = (
  user: User,
  records: AttendanceRecord[], 
  allRecordsThisMonth: AttendanceRecord[], 
  weekStart: Date,
  weekEnd: Date,
  bonus: number = 0,
  manualDeduction: number = 0
): PayrollReport => {
  const isDaily30 = user.payrollMethod === PayrollMethod.DAILY_30;
  const methodLabel = isDaily30 ? 'Harian (Bagi 30)' : 'Mingguan (Bagi 4)';

  // Perhitungan harian standar
  const dailyGapok = user.gapok / DAYS_IN_MONTH;
  const dailyUangMakan = user.uangMakan / DAYS_IN_MONTH;
  const fullDailyRate = user.deductionRate || (dailyGapok + dailyUangMakan);

  let weeklyBase = 0;
  if (isDaily30) {
    weeklyBase = (dailyGapok + dailyUangMakan) * 7;
  } else {
    weeklyBase = (user.gapok + user.uangMakan) / 4;
  }
  
  const weekRecords = records.filter(r => {
    const d = new Date(r.date);
    return d >= weekStart && d <= weekEnd;
  });

  const presentRecords = weekRecords.filter(r => r.status === 'PRESENT');
  const totalOnTime = presentRecords.filter(r => !r.isLate).length;
  const totalLate = presentRecords.filter(r => r.isLate).length;
  const leaveCountThisWeek = weekRecords.filter(r => r.status === 'LEAVE' || r.status === 'ABSENT').length;

  const sortedMonthRecords = [...allRecordsThisMonth].sort((a, b) => a.date.localeCompare(b.date));
  
  let monthlyAbsentCounter = 0;
  let totalDeductionsThisWeek = 0;
  let excessLeaveCountThisWeek = 0;

  // Logika Khusus: Dwi vs Lainnya (Mega)
  // Asumsi identifikasi Dwi berdasarkan username atau ID '2'
  const isDwi = user.id === '2' || user.username.toLowerCase().includes('dwi');

  sortedMonthRecords.forEach(record => {
    const isAbsentOrLeave = record.status === 'LEAVE' || record.status === 'ABSENT';
    if (isAbsentOrLeave) {
      monthlyAbsentCounter++;
      
      const recordDate = new Date(record.date);
      // Hanya hitung potongan jika tanggal berada dalam rentang minggu payroll yang dipilih
      if (recordDate >= weekStart && recordDate <= weekEnd) {
        if (isDwi) {
          // Aturan Dwi: Selalu potong uang makan (20rb) jika tidak masuk walau dlm jatah
          if (monthlyAbsentCounter <= FREE_LEAVE_QUOTA) {
            totalDeductionsThisWeek += 20000; 
          } else {
            // Jika lewat jatah 3 hari, potong full (Gapok + Makan)
            totalDeductionsThisWeek += fullDailyRate;
            excessLeaveCountThisWeek++;
          }
        } else {
          // Aturan Mega/Lainnya: Tidak dipotong jika masih dalam jatah 3 hari
          if (monthlyAbsentCounter > FREE_LEAVE_QUOTA) {
            totalDeductionsThisWeek += fullDailyRate;
            excessLeaveCountThisWeek++;
          }
        }
      }
    }
  });

  const totalDeductions = totalDeductionsThisWeek + manualDeduction;
  const netSalary = Math.max(0, weeklyBase + bonus - totalDeductions);

  return {
    userId: user.id,
    userName: user.name,
    weekStartDate: weekStart.toISOString().split('T')[0],
    weekEndDate: weekEnd.toISOString().split('T')[0],
    totalPresent: presentRecords.length,
    totalOnTime,
    totalLate,
    totalLeave: leaveCountThisWeek,
    monthlyLeaveCount: monthlyAbsentCounter,
    excessLeaveCount: excessLeaveCountThisWeek,
    grossSalary: weeklyBase,
    bonus,
    manualDeduction,
    deductions: totalDeductions,
    netSalary: netSalary,
    dailyRate: fullDailyRate,
    methodLabel
  };
};
