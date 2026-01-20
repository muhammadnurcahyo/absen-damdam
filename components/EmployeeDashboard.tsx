
import React, { useState, useRef, useEffect } from 'react';
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
  onSubmitLeave: (date: string, reason: string, photo?: string) => void;
  payrollAdjustments: { bonus: number, deduction: number };
}

const EmployeeDashboard: React.FC<EmployeeDashboardProps> = ({
  user,
  outletConfig,
  attendance,
  leaveRequests,
  onClockIn,
  onClockOut,
  onSubmitLeave,
  payrollAdjustments
}) => {
  const [loadingLoc, setLoadingLoc] = useState(false);
  const [errorLoc, setErrorLoc] = useState<string | null>(null);
  const [leaveDate, setLeaveDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [evidencePhoto, setEvidencePhoto] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [slipStartDate, setSlipStartDate] = useState('');
  const [slipEndDate, setSlipEndDate] = useState('');

  useEffect(() => {
    const today = new Date();
    const day = today.getDay(); 
    const diffToThursday = (day <= 4) ? (4 - day) : (4 - day + 7);
    const end = new Date(today);
    end.setDate(today.getDate() + diffToThursday);
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    setSlipStartDate(start.toISOString().split('T')[0]);
    setSlipEndDate(end.toISOString().split('T')[0]);
  }, []);

  const todayStr = new Date().toISOString().split('T')[0];
  const todayRecord = attendance.find(r => r.date === todayStr && r.userId === user.id);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  const monthRecords = attendance.filter(a => 
    a.userId === user.id && 
    new Date(a.date).getMonth() === currentMonth &&
    new Date(a.date).getFullYear() === currentYear
  );

  const usedQuota = monthRecords.filter(a => a.status === 'LEAVE' || a.status === 'ABSENT').length;
  const sisaLibur = Math.max(0, FREE_LEAVE_QUOTA - usedQuota);
  const onTimeCount = monthRecords.filter(a => a.status === 'PRESENT' && !a.isLate).length;
  const lateCount = monthRecords.filter(a => a.status === 'PRESENT' && a.isLate).length;

  const weekStart = new Date(slipStartDate || new Date());
  const weekEnd = new Date(slipEndDate || new Date());
  const payrollSummary = calculateWeeklyPayroll(
    user, 
    attendance.filter(a => a.userId === user.id), 
    monthRecords, 
    weekStart, 
    weekEnd, 
    payrollAdjustments.bonus, 
    payrollAdjustments.deduction
  );

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setEvidencePhoto(reader.result as string);
      reader.readAsDataURL(file);
    }
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
      
      // Radius default 100 jika tidak ada config
      const allowedRadius = outletConfig.radius || 100;

      if (dist <= allowedRadius) {
        onClockIn(pos.coords.latitude, pos.coords.longitude);
      } else {
        setErrorLoc(`Lokasi Terlalu Jauh: Anda berjarak ${Math.round(dist)}m. Batas radius: ${allowedRadius}m.`);
      }
    } catch (err) {
      setErrorLoc("GPS Error: Gagal mendapatkan lokasi. Pastikan GPS aktif dan izin diberikan.");
    } finally {
      setLoadingLoc(false);
    }
  };

  const handleDownloadSlip = () => {
    if (!slipStartDate || !slipEndDate) return alert("Pilih tanggal!");
    const { jsPDF } = (window as any).jspdf;
    const weekStart = new Date(slipStartDate);
    const weekEnd = new Date(slipEndDate);
    const monthStart = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), 1);
    
    const mRecords = attendance.filter(a => a.userId === user.id && new Date(a.date) >= monthStart && new Date(a.date) <= weekEnd);
    const report = calculateWeeklyPayroll(user, attendance.filter(a => a.userId === user.id), mRecords, weekStart, weekEnd, payrollAdjustments.bonus, payrollAdjustments.deduction);

    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(79, 70, 229);
    doc.text("DamDam Laundry", 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`SLIP GAJI MINGGUAN`, 105, 28, { align: 'center' });
    doc.line(14, 35, 196, 35);
    
    doc.setTextColor(50);
    doc.setFontSize(11);
    doc.text(`Nama Karyawan: ${user.name}`, 14, 45);
    doc.text(`Periode Kerja: ${report.weekStartDate} s/d ${report.weekEndDate}`, 14, 52);
    doc.setFont("helvetica", "bold");
    doc.text(`Total Izin Bulan Ini: ${report.monthlyLeaveCount} kali`, 14, 59);
    doc.setFont("helvetica", "normal");

    const deductionLabel = user.uangMakan > 0 ? 'Potongan Kehadiran' : 'Potongan Gaji';
    (doc as any).autoTable({
      startY: 70,
      head: [['DESKRIPSI', 'KETERANGAN', 'JUMLAH']],
      body: [
        ['Gaji Kotor Mingguan', report.methodLabel, `Rp ${report.grossSalary.toLocaleString('id-ID')}`],
        ['Bonus Mingguan', 'Diberikan Owner', `Rp ${report.bonus.toLocaleString('id-ID')}`],
        [deductionLabel, `${report.totalLeave} Izin Minggu Ini`, `Rp ${(report.deductions - report.manualDeduction).toLocaleString('id-ID')}`],
        ['Potongan Lainnya', 'Manual/Kasbon', `Rp ${report.manualDeduction.toLocaleString('id-ID')}`],
      ],
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
      styles: { fontSize: 9 }
    });
    
    const finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL DITERIMA: Rp " + report.netSalary.toLocaleString('id-ID'), 14, finalY);
    
    doc.save(`slip_damdam_${user.username}_${report.weekEndDate}.pdf`);
  };

  const history = attendance.filter(a => a.userId === user.id).sort((a,b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Statistik Utama */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm flex items-center space-x-4">
          <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-lg">📅</div>
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Jatah Izin</p>
            <p className={`text-lg font-black ${sisaLibur > 0 ? 'text-green-600' : 'text-red-500'}`}>{sisaLibur} / {FREE_LEAVE_QUOTA}x</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm flex items-center space-x-4">
          <div className="w-10 h-10 bg-green-50 text-green-600 rounded-xl flex items-center justify-center text-lg">✅</div>
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tepat Waktu</p>
            <p className="text-lg font-black text-slate-900">{onTimeCount} Hari</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm flex items-center space-x-4">
          <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center text-lg">⚠️</div>
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Terlambat</p>
            <p className="text-lg font-black text-slate-900">{lateCount} Hari</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-start">
        <div className="lg:col-span-5 space-y-6 md:space-y-8">
          {/* Absensi Action */}
          <div className="bg-white p-8 md:p-10 rounded-[32px] md:rounded-[48px] border border-slate-100 shadow-sm text-center">
            <h2 className="text-xl md:text-2xl font-black text-slate-900 mb-6 tracking-tight">Halo, {user.name}</h2>
            <div className="mb-8">
              {!todayRecord?.clockIn && todayRecord?.status !== 'LEAVE' && todayRecord?.status !== 'LEAVE_PENDING' ? (
                <button onClick={handleClockInAction} disabled={loadingLoc} className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[20px] font-black text-lg shadow-xl shadow-indigo-100 active:scale-95 transition-all">
                  {loadingLoc ? 'MENGECEK...' : 'ABSEN MASUK'}
                </button>
              ) : todayRecord?.status === 'LEAVE_PENDING' ? (
                <div className="p-6 bg-amber-50 text-amber-700 rounded-2xl font-black border border-amber-100 text-sm">MENUNGGU ACC ⏳</div>
              ) : todayRecord?.status === 'LEAVE' ? (
                <div className="p-6 bg-green-50 text-green-700 rounded-2xl font-black border border-green-100 text-sm">IZIN DISETUJUI ✅</div>
              ) : !todayRecord?.clockOut ? (
                <button onClick={onClockOut} className="w-full py-5 bg-orange-500 hover:bg-orange-600 text-white rounded-[20px] font-black text-lg shadow-xl shadow-orange-100 active:scale-95 transition-all">ABSEN PULANG</button>
              ) : (
                <div className="p-6 bg-indigo-50 text-indigo-700 rounded-2xl font-black border border-indigo-100 text-sm">SELESAI HARI INI ✅</div>
              )}
              {errorLoc && <p className="mt-4 text-[10px] font-black text-red-500 uppercase px-4 leading-relaxed">{errorLoc}</p>}
            </div>

            {/* Payroll Real-time Summary */}
            <div className="bg-indigo-900 text-white p-6 rounded-[24px] text-left mb-6 shadow-xl shadow-indigo-100">
               <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">Ringkasan Gaji Minggu Ini</p>
               <h3 className="text-2xl font-black mb-4">Rp {payrollSummary.netSalary.toLocaleString('id-ID')}</h3>
               <div className="grid grid-cols-2 gap-2 text-[9px] font-black uppercase tracking-widest">
                  <div className="bg-white/10 p-2 rounded-lg">
                    <p className="opacity-60">Bonus</p>
                    <p className="text-green-400">Rp {payrollSummary.bonus.toLocaleString('id-ID')}</p>
                  </div>
                  <div className="bg-white/10 p-2 rounded-lg">
                    <p className="opacity-60">Potongan</p>
                    <p className="text-red-400">Rp {payrollSummary.deductions.toLocaleString('id-ID')}</p>
                  </div>
               </div>
            </div>

            <div className="bg-slate-50 p-6 rounded-[24px] space-y-4">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-left">Download Slip Gaji</p>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={slipStartDate} onChange={e => setSlipStartDate(e.target.value)} className="p-3 bg-white border border-slate-200 rounded-xl text-[10px] font-bold outline-none" />
                <input type="date" value={slipEndDate} onChange={e => setSlipEndDate(e.target.value)} className="p-3 bg-white border border-slate-200 rounded-xl text-[10px] font-bold outline-none" />
              </div>
              <button onClick={handleDownloadSlip} className="w-full py-4 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all">Download Slip PDF</button>
            </div>
          </div>

          <div className="bg-white p-8 md:p-10 rounded-[32px] md:rounded-[48px] border border-slate-100 shadow-sm">
            <h3 className="font-black text-lg text-slate-900 mb-6 uppercase tracking-tight">Ajukan Izin</h3>
            <div className="space-y-4">
              <input type="date" value={leaveDate} onChange={e => setLeaveDate(e.target.value)} className="w-full p-4 bg-white border border-slate-200 rounded-xl font-bold outline-none text-sm" min={todayStr} />
              <textarea value={leaveReason} onChange={e => setLeaveReason(e.target.value)} placeholder="Alasan ketidakhadiran..." className="w-full p-4 bg-white border border-slate-200 rounded-xl font-medium min-h-[100px] outline-none text-sm" />
              <div onClick={() => fileInputRef.current?.click()} className="w-full p-6 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-all bg-white">
                {evidencePhoto ? <img src={evidencePhoto} className="h-20 object-contain rounded-lg shadow-sm" /> : <div className="text-center text-slate-400 text-[10px] font-black uppercase tracking-widest">📸 Foto Bukti</div>}
              </div>
              <input type="file" ref={fileInputRef} onChange={handlePhotoChange} accept="image/*" className="hidden" />
              <button onClick={() => { if(leaveDate && leaveReason) { onSubmitLeave(leaveDate, leaveReason, evidencePhoto); setLeaveDate(''); setLeaveReason(''); setEvidencePhoto(undefined); } }} className="w-full bg-indigo-600 text-white py-5 rounded-xl font-black shadow-lg uppercase tracking-widest text-[10px]">Kirim Pengajuan</button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 bg-white p-6 md:p-10 rounded-[32px] md:rounded-[48px] border border-slate-100 shadow-sm min-h-[400px]">
          <h2 className="text-xl font-black text-slate-900 mb-8 tracking-tight uppercase tracking-tight">Riwayat Absensi</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[350px]">
              <thead>
                <tr className="text-[9px] font-black uppercase text-slate-400 tracking-widest border-b pb-4">
                  <th className="pb-4 px-2">Tanggal</th>
                  <th className="pb-4 px-2">Jam</th>
                  <th className="pb-4 px-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {history.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="py-4 px-2 font-black text-slate-800 text-sm">{item.date}</td>
                    <td className="py-4 px-2 font-bold text-slate-400 text-xs">{item.clockIn || '--:--'}</td>
                    <td className="py-4 px-2 text-right">
                      <span className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase ${
                        item.status === 'PRESENT' ? (item.isLate ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700') : 
                        item.status === 'LEAVE_PENDING' ? 'bg-slate-100 text-slate-500' : 
                        item.status === 'LEAVE' ? 'bg-indigo-100 text-indigo-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {item.status === 'PRESENT' ? (item.isLate ? 'Telat' : 'Hadir') : 
                         item.status === 'LEAVE_PENDING' ? 'Menunggu' : 
                         item.status === 'LEAVE' ? 'Izin' : 'Absen'}
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
