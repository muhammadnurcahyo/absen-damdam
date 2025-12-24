
import React, { useState } from 'react';
import { User, AttendanceRecord, LeaveRequest, OutletConfig } from '../types';
import { getCurrentPosition, calculateDistance } from '../services/locationService';
import { FREE_LEAVE_QUOTA } from '../constants';

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

  const getMergedHistory = () => {
    const userAttendance = attendance.filter(a => a.userId === user.id);
    const userLeaves = leaveRequests.filter(l => l.userId === user.id);

    const history: any[] = [];

    // Add normal attendance
    userAttendance.forEach(a => {
      history.push({
        date: a.date,
        clockIn: a.clockIn,
        clockOut: a.clockOut,
        statusText: a.status === 'PRESENT' ? 'HADIR' : 'ABSEN',
        rawDate: new Date(a.date)
      });
    });

    // Add leaves (including pending)
    userLeaves.forEach(l => {
      // Avoid duplication if an attendance record already exists for the same date (though logically it shouldn't for a leave)
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
  const mergedHistory = getMergedHistory();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Kolom Aksi - Tema Putih */}
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

          <div className="grid grid-cols-2 gap-4">
              <div className="p-5 bg-white rounded-3xl border border-slate-100 flex flex-col items-center">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Sisa Jatah Libur</p>
                <p className="text-2xl font-black text-indigo-600">{sisaLibur}x</p>
              </div>
              <div className="p-5 bg-white rounded-3xl border border-slate-100 flex flex-col items-center">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Status Lokasi</p>
                <p className="text-2xl font-black text-slate-900">{distance ? 'OK' : '--'}</p>
              </div>
          </div>

          {errorLoc && <p className="mt-6 text-xs font-bold text-red-500 bg-red-50 p-4 rounded-2xl border border-red-100">{errorLoc}</p>}
        </div>

        {/* Form Izin - Putih Terang */}
        <div className="bg-white p-10 rounded-[48px] border border-slate-100 shadow-sm">
          <h3 className="font-black text-2xl text-slate-900 mb-8 flex items-center">
             <span className="w-2 h-6 bg-purple-500 rounded-full mr-3"></span>
             Ajukan Izin
          </h3>
          <div className="space-y-5">
            <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Kapan Anda Berencana Libur?</label>
                <div className="relative">
                  <input 
                  type="date" value={leaveDate} onChange={e => setLeaveDate(e.target.value)}
                  className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl outline-none focus:ring-2 focus:ring-purple-500 font-black text-slate-700 transition-all appearance-none"
                  min={today}
                  />
                </div>
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

      {/* Kolom Riwayat Kehadiran */}
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
