
import { User, AttendanceRecord, PayrollReport, PayrollMethod } from '../types';
import { FREE_LEAVE_QUOTA, DAYS_IN_MONTH } from '../constants';

/**
 * Helper to format date as YYYY-MM-DD in local time
 */
const toLocalDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Menghitung payroll mingguan dengan mempertimbangkan:
 * 1. Kebijakan khusus Mba Dwi & Bu Mega.
 * 2. Kuota izin bulanan (reset setiap tanggal 1).
 * 3. Potongan kasbon & bonus manual.
 */
export const calculateWeeklyPayroll = (
  user: User,
  allUserRecords: AttendanceRecord[], 
  recordsInPayrollMonth: AttendanceRecord[], 
  weekStart: Date,
  weekEnd: Date,
  bonus: number = 0,
  manualDeduction: number = 0
): PayrollReport => {
  const usernameLower = user.username.toLowerCase();
  const isDwi = usernameLower.includes('dwi');
  const isMega = usernameLower.includes('mega');
  const isDaily30 = user.payrollMethod === PayrollMethod.DAILY_30;
  
  let weeklyBase = 0;
  let methodLabel = isDaily30 ? 'Harian (Bagi 30)' : 'Mingguan (Bagi 4)';
  let dailyRateForDeduction = 0;

  if (isDwi) {
    weeklyBase = 515000;
    dailyRateForDeduction = 20000; 
  } else if (isMega) {
    weeklyBase = user.gapok / 4;
    dailyRateForDeduction = 55000;
  } else {
    const dailyGapok = user.gapok / DAYS_IN_MONTH;
    const dailyUangMakan = user.uangMakan / DAYS_IN_MONTH;
    dailyRateForDeduction = user.deductionRate || (dailyGapok + dailyUangMakan);

    if (isDaily30) {
      weeklyBase = (dailyGapok + dailyUangMakan) * 7;
    } else {
      weeklyBase = (user.gapok + user.uangMakan) / 4;
    }
  }
  
  const weekStartStr = toLocalDateString(weekStart);
  const weekEndStr = toLocalDateString(weekEnd);
  
  // Deduplicate records by date
  const dailyRecordsMap = new Map<string, AttendanceRecord>();
  allUserRecords.forEach(record => {
    const existing = dailyRecordsMap.get(record.date);
    if (!existing) {
      dailyRecordsMap.set(record.date, record);
    } else {
      // Prioritaskan status yang berpengaruh pada payroll
      if (record.status === 'LEAVE' || record.status === 'LEAVE_PENDING' || record.status === 'ABSENT') {
        dailyRecordsMap.set(record.date, record);
      } else if (record.status === 'PRESENT' && (existing.status !== 'LEAVE' && existing.status !== 'LEAVE_PENDING')) {
        dailyRecordsMap.set(record.date, record);
      }
    }
  });

  let monthlyAbsentCounter = 0;
  let totalDeductionsThisWeek = 0;
  let excessLeaveCountThisWeek = 0;
  let weekPresent = 0;
  let weekOnTime = 0;
  let weekLate = 0;
  let weekLeave = 0;

  // Loop utama perhitungan payroll
  const tempDate = new Date(weekStart);
  while (tempDate <= weekEnd) {
    const dateStr = toLocalDateString(tempDate);
    const isInCurrentWeek = dateStr >= weekStartStr && dateStr <= weekEndStr;

    // Hitung akumulasi bulanan sampai dengan tanggal tempDate
    const startOfMonth = new Date(tempDate.getFullYear(), tempDate.getMonth(), 1);
    let currentMonthQuotaCounter = 0;
    
    const quotaPtr = new Date(startOfMonth);
    while (quotaPtr <= tempDate) {
      const qDateStr = toLocalDateString(quotaPtr);
      const qRec = dailyRecordsMap.get(qDateStr);
      if (qRec?.status === 'LEAVE' || qRec?.status === 'ABSENT' || qRec?.status === 'LEAVE_PENDING') {
        currentMonthQuotaCounter++;
      }
      quotaPtr.setDate(quotaPtr.getDate() + 1);
    }

    // Selalu update monthlyAbsentCounter ke nilai terbaru dari loop penanda kuota
    // agar di laporan akhir, angkanya sesuai dengan akumulasi real-time bulan itu
    if (tempDate.getMonth() === weekEnd.getMonth()) {
      monthlyAbsentCounter = currentMonthQuotaCounter;
    }

    const record = dailyRecordsMap.get(dateStr);
    const isActuallyAbsent = record?.status === 'ABSENT';
    const isApprovedLeave = record?.status === 'LEAVE';
    const isPendingLeave = record?.status === 'LEAVE_PENDING';

    if (isActuallyAbsent || isApprovedLeave || isPendingLeave) {
      if (isInCurrentWeek) {
        weekLeave++;
        
        // Logika pemotongan gaji (hanya untuk status final: ABSENT atau LEAVE)
        if (isActuallyAbsent || isApprovedLeave) {
          if (isDwi) {
            if (currentMonthQuotaCounter <= 3) {
              totalDeductionsThisWeek += 20000;
            } else {
              totalDeductionsThisWeek += 70000;
              excessLeaveCountThisWeek++;
            }
          } else if (isMega) {
            // Bu Mega: 3 hari pertama izin/absen dalam sebulan gratis, setelahnya potong 55rb
            if (currentMonthQuotaCounter > 3) {
              totalDeductionsThisWeek += 55000;
              excessLeaveCountThisWeek++;
            }
          } else {
            // Karyawan Umum: Jatah 3 hari, selebihnya potong harian
            if (currentMonthQuotaCounter > FREE_LEAVE_QUOTA) {
              totalDeductionsThisWeek += dailyRateForDeduction;
              excessLeaveCountThisWeek++;
            }
          }
        }
      }
    } else if (record?.status === 'PRESENT' && isInCurrentWeek) {
      weekPresent++;
      if (record.isLate) weekLate++;
      else weekOnTime++;
    }

    tempDate.setDate(tempDate.getDate() + 1);
  }

  const totalDeductions = totalDeductionsThisWeek + manualDeduction;
  const netSalary = Math.max(0, weeklyBase + bonus - totalDeductions);

  return {
    userId: user.id,
    userName: user.name,
    weekStartDate: weekStartStr,
    weekEndDate: weekEndStr,
    totalPresent: weekPresent,
    totalOnTime: weekOnTime,
    totalLate: weekLate,
    totalLeave: weekLeave,
    monthlyLeaveCount: monthlyAbsentCounter,
    excessLeaveCount: excessLeaveCountThisWeek,
    grossSalary: weeklyBase,
    bonus,
    manualDeduction,
    deductions: totalDeductions,
    netSalary: netSalary,
    dailyRate: dailyRateForDeduction,
    methodLabel,
    totalKasbon: user.totalKasbon
  };
};
