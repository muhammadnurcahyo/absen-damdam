
import React, { useState } from 'react';
import { User, AttendanceRecord, LeaveRequest, OutletConfig } from '../types';
import { getCurrentPosition, calculateDistance } from '../services/locationService';
import { FREE_LEAVE_QUOTA } from '../constants';
import { calculateWeeklyPayroll } from '../services/payrollService';

interface EmployeeDashboardProps {
  user: User;
  outletConfig: OutletConfig;
  attendance: AttendanceRecord[];
  leaveRequests: LeaveRequest[];
  onClockIn: (lat: number, lng: number) => void;
  onClockOut: () => void;
  onSubmitLeave: (date: string, reason: string) => void;
}

const EmployeeDashboard: React.FC<EmployeeDashboardProps> = ({
  user,
  outletConfig,
  attendance,
  leaveRequests,
  onClockIn,
  onClockOut,
  onSubmitLeave
}) => {
  const [distance, setDistance] = useState<number | null>(null);
  const [loadingLoc, setLoadingLoc] = useState(false);
  const [errorLoc, setErrorLoc] = useState<string | null>(null);
  const [leaveDate, setLeaveDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');

  const today = new Date().toISOString().split('T')[0];
  const todayRecord = attendance.find(r => r.date === today && r.userId === user.id);

  const getRemainingLeave = () => {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const approvedLeaves = leaveRequests.filter(l => 
      l.userId === user.id && 
      l.status === 'APPROVED' && 
      new Date(l.date).getMonth() === currentMonth &&
      new Date(l.date).getFullYear() === currentYear
    ).length;
    return Math.max(0, FREE_LEAVE_QUOTA - approvedLeaves);
  };

  const getStats = () => {
    const userAttendance = attendance.filter(a => a.userId === user.id);
    const onTime = userAttendance.filter(a => a.status === 'PRESENT' && !a.isLate).length;
    const late = userAttendance.filter(a => a.status === 'PRESENT' && a.isLate).length;
    const totalIzin = leaveRequests.filter(l => l.userId === user.id && l.status === 'APPROVED').length;
    return { onTime, late, totalIzin };
  };

  const getMergedHistory = () => {
    const userAttendance = attendance.filter(a => a.userId === user.id);
    const userLeaves = leaveRequests.filter(l => l.userId === user.id);

    const history: any[] = [];

    userAttendance.forEach(a => {
      let statusLabel = a.status === 'PRESENT' ? 'HADIR' : 'ABSEN';
      if (a.status === 'PRESENT' && a.isLate) statusLabel = 'TERLAMBAT';
      
      history.push({
        date: a.date,
        clockIn: a.clockIn,
        clockOut: a.clockOut,
        statusText: statusLabel,
        isLate: a.isLate,
        rawDate: new Date(a.date)
      });
    });

    userLeaves.forEach(l => {
      const existing = history.find(h => h.date === l.date);
      if (!existing) {
        let statusText = 'IZIN (PENDING)';
        if (l.status === 'APPROVED') statusText = 'IZIN (DISETUJUI)';
        if (l.status === 'REJECTED') statusText = 'IZIN (DITOLAK)';

        history.push({
          date: l.date,
          clockIn: '--:--',
          clockOut: '--:--',
          statusText: statusText,
          rawDate: new Date(l.date)
        });
      }
    });

    return history.sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime());
  };

  const handleDownloadSlip = () => {
    const { jsPDF } = (window as any).jspdf;
    const todayDate = new Date();
    const weekEnd = new Date(todayDate);
    const weekStart = new Date(todayDate);
    weekStart.setDate(todayDate.getDate() - 6);

    const monthRecords = attendance.filter(a => a.userId === user.id);
    const report = calculateWeeklyPayroll(user, attendance.filter(a => a.userId === user.id), monthRecords, weekStart, weekEnd);

    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(79, 70, 229);
    doc.text("DamDam Laundry", 105, 20, { align: 'center' });
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text("SLIP GAJI MINGGUAN KARYAWAN", 105, 28, { align: 'center' });
    doc.line(14, 35, 196, 35);

    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.text(`Nama Karyawan: ${user.name}`, 14, 45);
    doc.text(`Username: @${user.username}`, 14, 51);
    doc.text(`Periode: ${report.weekStartDate} s/d ${report.weekEndDate}`, 14, 57);

    const attDeduction = report.excessLeaveCount * report.dailyRate;
    const deductionLabel = user.uangMakan > 0 ? 'Potongan Uang Makan' : 'Potongan Gaji Pokok';

    (doc as any).autoTable({
      startY: 65,
      head: [['DESKRIPSI', 'KETERANGAN', 'JUMLAH']],
      body: [
        ['Gaji Kotor (Gapok + Makan)', 'Mingguan (7 Hari)', `Rp ${report.grossSalary.toLocaleString('id-ID')}`],
        ['Bonus Mingguan', 'Dari Owner', `Rp ${report.bonus.toLocaleString('id-ID')}`],
        [deductionLabel, `${report.excessLeaveCount} Hari (>3x)`, `Rp ${attDeduction.toLocaleString('id-ID')}`],
        ['Potongan Lainnya', 'Manual', `Rp ${report.manualDeduction.toLocaleString('id-ID')}`],
      ],
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0);
    doc.text("TOTAL GAJI DITERIMA", 14, finalY);
    doc.setTextColor(79, 70, 229);
    doc.text(`Rp ${report.netSalary.toLocaleString('id-ID')}`, 196, finalY, { align: 'right' });

    doc.save(`slip_gaji_${user.username}_${report.weekEndDate}.pdf`);
  };

  const handleClockInAction = async () => {
    setLoadingLoc(true);
    setErrorLoc(null);
    try {
      const pos = await getCurrentPosition();
      const dist = calculateDistance(
        pos.coords.latitude,
        pos.coords.longitude,
        outletConfig.latitude,
        outletConfig.longitude
      );
      setDistance(dist);
      if (dist <= outletConfig.radius) {
        onClockIn(pos.coords.latitude, pos.coords.longitude);
      } else {
        setErrorLoc(`Gagal: Lokasi Anda ${Math.round(dist)}m dari titik pusat. Batas maksimal ${outletConfig.radius}m.`);
      }
    } catch (err) {
      setErrorLoc("Akses lokasi ditolak. Harap aktifkan GPS Anda.");
    } finally {
      setLoadingLoc(false);
    }
  };

  const sisaLibur = getRemainingLeave();
  const stats = getStats();
  const mergedHistory = getMergedHistory();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <div className="lg:col-span-5 space-y-8">
        <div className="bg-white p-12 rounded-[48px] border border-slate-100 shadow-sm text-center">
          <div className="w-24 h-24 bg-indigo-50 text-indigo-600 rounded-[32px] flex items-center justify-center mx-auto mb-8 text-4xl shadow-sm rotate-6 hover:rotate-0 transition-all duration-500">
            🧺
          </div>
          <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">Halo, {user.name.split(' ')[0]}!</h2>
          <p className="text-slate-400 text-sm mb-10 font-bold uppercase tracking-widest">
            {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>

          <div className="mb-10">
            {!todayRecord?.clockIn && todayRecord?.status !== 'LEAVE' ? (
              <button
                onClick={handleClockInAction}
                disabled={loadingLoc}
                className="w-full py-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-3xl font-black text-xl shadow-2xl shadow-indigo-100 transition-all transform active:scale-95 disabled:opacity-50"
              >
                {loadingLoc ? 'MENGECEK LOKASI...' : 'ABSEN MASUK SEKARANG'}
              </button>
            ) : todayRecord?.status === 'LEAVE' ? (
              <div className="p-8 bg-purple-50 text-purple-700 rounded-[32px] font-black border border-purple-100 shadow-inner">
                 <p className="text-lg">HARI INI ANDA IZIN (OFF)</p>
                 <p className="text-[10px] uppercase mt-1 opacity-60 italic">Nikmati waktu istirahat Anda</p>
              </div>
            ) : !todayRecord?.clockOut ? (
              <button
                onClick={onClockOut}
                className="w-full py-6 bg-orange-500 hover:bg-orange-600 text-white rounded-3xl font-black text-xl shadow-2xl shadow-orange-100 transition-all active:scale-95"
              >
                ABSEN KELUAR (PULANG)
              </button>
            ) : (
              <div className="p-8 bg-green-50 text-green-700 rounded-[32px] font-black border border-green-100 shadow-inner">
                TUGAS HARI INI SELESAI! ✅
                <p className="text-[10px] uppercase mt-1 opacity-60">Kembali lagi besok pagi</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 mb-8">
              <div className="p-4 bg-white rounded-2xl border border-slate-100 flex flex-col items-center">
                <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Tepat Waktu</p>
                <p className="text-lg font-black text-green-600">{stats.onTime}</p>
              </div>
              <div className="p-4 bg-white rounded-2xl border border-slate-100 flex flex-col items-center">
                <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Terlambat</p>
                <p className="text-lg font-black text-yellow-600">{stats.late}</p>
              </div>
              <div className="p-4 bg-white rounded-2xl border border-slate-100 flex flex-col items-center">
                <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Izin Diacc</p>
                <p className="text-lg font-black text-purple-600">{stats.totalIzin}</p>
              </div>
          </div>

          <button 
            onClick={handleDownloadSlip}
            className="w-full py-4 border-2 border-indigo-100 text-indigo-600 rounded-3xl font-black text-sm uppercase tracking-widest hover:bg-indigo-50 transition-all mb-4"
          >
            Unduh Slip Gaji Minggu Ini
          </button>

          <p className="text-[10px] font-black text-slate-300 uppercase">Jatah Libur: {sisaLibur} / {FREE_LEAVE_QUOTA}x Sebulan</p>

          {errorLoc && <p className="mt-6 text-xs font-bold text-red-500 bg-red-50 p-4 rounded-2xl border border-red-100">{errorLoc}</p>}
        </div>

        <div className="bg-white p-10 rounded-[48px] border border-slate-100 shadow-sm">
          <h3 className="font-black text-2xl text-slate-900 mb-8 flex items-center">
             <span className="w-2 h-6 bg-purple-500 rounded-full mr-3"></span>
             Ajukan Izin
          </h3>
          <div className="space-y-5">
            <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Kapan Anda Berencana Libur?</label>
                <input 
                  type="date" value={leaveDate} onChange={e => setLeaveDate(e.target.value)}
                  className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl outline-none focus:ring-2 focus:ring-purple-500 font-black text-slate-700 transition-all appearance-none"
                  min={today}
                />
            </div>
            <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Apa Alasan Anda?</label>
                <textarea 
                  placeholder="Berikan alasan yang jelas..." value={leaveReason} onChange={e => setLeaveReason(e.target.value)}
                  className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl outline-none focus:ring-2 focus:ring-purple-500 min-h-[140px] font-medium text-slate-700"
                />
            </div>
            <button 
              onClick={() => { if(leaveDate && leaveReason) { onSubmitLeave(leaveDate, leaveReason); setLeaveDate(''); setLeaveReason(''); } }}
              className="w-full bg-purple-600 text-white py-5 rounded-3xl font-black hover:bg-purple-700 shadow-xl shadow-purple-50 transition-all active:scale-95"
            >
              KIRIM PENGAJUAN IZIN
            </button>
          </div>
        </div>
      </div>

      <div className="lg:col-span-7 space-y-8">
        <div className="bg-white p-10 rounded-[48px] border border-slate-100 shadow-sm min-h-[700px]">
          <h2 className="text-2xl font-black text-slate-900 mb-10 flex items-center">
            <span className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mr-4 text-xl">🗓️</span> 
            Riwayat Aktivitas Bulanan
          </h2>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-50">
                <tr>
                  <th className="pb-8 pl-4">Hari/Tanggal</th>
                  <th className="pb-8">Masuk</th>
                  <th className="pb-8">Keluar</th>
                  <th className="pb-8 pr-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {mergedHistory.length === 0 && (
                  <tr><td colSpan={4} className="py-24 text-center text-slate-400 font-bold italic bg-slate-50/20 rounded-[40px]">Belum ada data aktivitas untuk bulan ini.</td></tr>
                )}
                {mergedHistory.map((item, idx) => (
                  <tr key={idx} className="group hover:bg-slate-50/50 transition-all">
                    <td className="py-6 pl-4 font-black text-slate-800">{item.date}</td>
                    <td className="py-6 text-slate-500 font-black">{item.clockIn || '--:--'}</td>
                    <td className="py-6 text-slate-500 font-black">{item.clockOut || '--:--'}</td>
                    <td className="py-6 pr-4">
                      <span className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        item.statusText === 'HADIR' ? 'bg-green-100 text-green-700' : 
                        item.statusText === 'TERLAMBAT' ? 'bg-yellow-100 text-yellow-700' : 
                        item.statusText.includes('IZIN') ? 'bg-purple-100 text-purple-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {item.statusText}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployeeDashboard;
