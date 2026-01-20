
import React, { useState, useEffect } from 'react';
import { User, AttendanceRecord, LeaveRequest, OutletConfig, UserRole, PayrollMethod } from '../types';
import { calculateWeeklyPayroll } from '../services/payrollService';
import { FREE_LEAVE_QUOTA } from '../constants';

interface OwnerDashboardProps {
  activeMenu: 'dashboard' | 'employees' | 'attendance' | 'payroll' | 'settings';
  employees: User[];
  attendance: AttendanceRecord[];
  leaveRequests: LeaveRequest[];
  outletConfig: OutletConfig;
  onUpdateConfig: (config: OutletConfig) => void;
  onApproveLeave: (leaveId: string, status: 'APPROVED' | 'REJECTED') => void;
  onAddEmployee: (user: Partial<User>) => void;
  onEditEmployee: (user: User) => void;
  onDeleteEmployee: (userId: string) => void;
  payrollAdjustments: Record<string, { bonus: number, deduction: number }>;
  onUpdateAdjustment: (userId: string, field: 'bonus' | 'deduction', value: number) => void;
}

const OwnerDashboard: React.FC<OwnerDashboardProps> = ({
  activeMenu,
  employees,
  attendance,
  leaveRequests,
  outletConfig,
  onUpdateConfig,
  onApproveLeave,
  onAddEmployee,
  onEditEmployee,
  onDeleteEmployee,
  payrollAdjustments,
  onUpdateAdjustment
}) => {
  const [attStartDate, setAttStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [attEndDate, setAttEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [payStartDate, setPayStartDate] = useState('');
  const [payEndDate, setPayEndDate] = useState('');
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<User | null>(null);
  const [empForm, setEmpForm] = useState<Partial<User>>({ 
    name: '', username: '', password: '', gapok: 0, uangMakan: 0, deductionRate: 0, payrollMethod: PayrollMethod.DAILY_30 
  });
  const [tempConfig, setTempConfig] = useState<OutletConfig>(outletConfig);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  useEffect(() => {
    const today = new Date();
    const day = today.getDay(); 
    const diffToThursday = (day <= 4) ? (4 - day) : (4 - day + 7);
    const end = new Date(today);
    end.setDate(today.getDate() + diffToThursday);
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    setPayStartDate(start.toISOString().split('T')[0]);
    setPayEndDate(end.toISOString().split('T')[0]);
  }, []);

  // Update local temp config when prop changes (e.g. after sync or fetch)
  useEffect(() => {
    setTempConfig(outletConfig);
  }, [outletConfig]);

  const getStatsForEmployee = (userId: string) => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const monthRecs = attendance.filter(a => 
      a.userId === userId && 
      new Date(a.date).getMonth() === currentMonth &&
      new Date(a.date).getFullYear() === currentYear
    );
    const onTime = monthRecs.filter(a => a.status === 'PRESENT' && !a.isLate).length;
    const late = monthRecs.filter(a => a.status === 'PRESENT' && a.isLate).length;
    const leaves = monthRecs.filter(a => a.status === 'LEAVE' || a.status === 'ABSENT').length;
    const remaining = Math.max(0, FREE_LEAVE_QUOTA - leaves);
    return { onTime, late, leaves, remaining };
  };

  const downloadIndividualSlip = (emp: User) => {
    if (!payStartDate || !payEndDate) return alert("Pilih tanggal!");
    const report = getPayrollForUser(emp);
    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(22);
    doc.setTextColor(79, 70, 229);
    doc.text("DamDam Laundry", 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`SLIP GAJI KARYAWAN`, 105, 28, { align: 'center' });
    doc.line(14, 35, 196, 35);
    
    doc.setTextColor(50);
    doc.setFontSize(11);
    doc.text(`Nama: ${emp.name}`, 14, 45);
    doc.text(`Periode: ${report.weekStartDate} s/d ${report.weekEndDate}`, 14, 52);
    doc.setFont("helvetica", "bold");
    doc.text(`Total Izin Bulan Ini: ${report.monthlyLeaveCount} kali`, 14, 59);
    doc.setFont("helvetica", "normal");

    const deductionLabel = emp.uangMakan > 0 ? 'Potongan Kehadiran' : 'Potongan Gaji';
    (doc as any).autoTable({
      startY: 70,
      head: [['DESKRIPSI', 'DETAIL', 'JUMLAH']],
      body: [
        ['Gaji Kotor Mingguan', report.methodLabel, `Rp ${report.grossSalary.toLocaleString('id-ID')}`],
        ['Bonus Mingguan', 'Ditambahkan Owner', `Rp ${report.bonus.toLocaleString('id-ID')}`],
        [deductionLabel, `${report.totalLeave} Izin Minggu Ini`, `Rp ${(report.deductions - report.manualDeduction).toLocaleString('id-ID')}`],
        ['Potongan Lainnya', 'Manual/Kasbon', `Rp ${report.manualDeduction.toLocaleString('id-ID')}`],
      ],
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
    });
    
    const finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL DITERIMA: Rp " + report.netSalary.toLocaleString('id-ID'), 14, finalY);
    
    doc.save(`slip_${emp.username}_${report.weekEndDate}.pdf`);
  };

  const exportAttendanceToPDF = () => {
    const data = getMergedAttendance();
    if (data.length === 0) return;
    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(22);
    doc.setTextColor(79, 70, 229);
    doc.text("DamDam Laundry", 105, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(`LAPORAN ABSENSI: ${attStartDate} s/d ${attEndDate}`, 105, 30, { align: 'center' });
    
    const tableBody = data.map(item => [
      employees.find(e => e.id === item.userId)?.name || 'Unknown',
      item.date,
      item.clockIn || '--:--',
      item.clockOut || '--:--',
      item.statusText
    ]);

    (doc as any).autoTable({
      startY: 40,
      head: [['KARYAWAN', 'TANGGAL', 'MASUK', 'PULANG', 'STATUS']],
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
      styles: { fontSize: 8 }
    });
    
    doc.save(`laporan_absensi_damdam_${attStartDate}_${attEndDate}.pdf`);
  };

  const getMergedAttendance = () => {
    const start = new Date(attStartDate);
    const end = new Date(attEndDate);
    const dailyAtt = attendance.filter(a => {
      const d = new Date(a.date);
      return d >= start && d <= end;
    });
    const combined: any[] = [];
    dailyAtt.forEach(a => {
      let statusText = a.status === 'PRESENT' ? (a.isLate ? 'TERLAMBAT' : 'HADIR') : 
                      a.status === 'LEAVE_PENDING' ? 'MENUNGGU' : 
                      a.status === 'LEAVE' ? 'IZIN' : 'ABSEN';
      combined.push({ ...a, statusText });
    });
    return combined.sort((a, b) => b.date.localeCompare(a.date));
  };

  const getPayrollForUser = (user: User) => {
    const start = new Date(payStartDate || new Date());
    const end = new Date(payEndDate || new Date());
    const monthStart = new Date(end.getFullYear(), end.getMonth(), 1);
    const monthRecords = attendance.filter(a => a.userId === user.id && new Date(a.date) >= monthStart && new Date(a.date) <= end);
    const adj = payrollAdjustments[user.id] || { bonus: 0, deduction: 0 };
    return calculateWeeklyPayroll(user, attendance.filter(a => a.userId === user.id), monthRecords, start, end, adj.bonus, adj.deduction);
  };

  const handleSaveConfig = () => {
    onUpdateConfig(tempConfig);
    alert('Konfigurasi outlet berhasil disimpan!');
  };

  return (
    <div className="bg-white rounded-[40px] lg:rounded-[56px] border border-slate-100 shadow-sm p-8 lg:p-14 min-h-[600px]">
      {activeMenu === 'dashboard' && (
        <div className="space-y-10">
          <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Persetujuan Izin</h2>
          <div className="grid gap-6">
            {leaveRequests.filter(l => l.status === 'PENDING').map(l => {
                const stats = getStatsForEmployee(l.userId);
                return (
                  <div key={l.id} className="p-8 bg-slate-50 rounded-[32px] border border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-8 group hover:bg-white hover:shadow-xl hover:shadow-slate-100 transition-all duration-300">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-3">
                        <p className="font-black text-slate-900 text-xl">{employees.find(e => e.id === l.userId)?.name}</p>
                        <span className={`text-[9px] px-3 py-1.5 rounded-full font-black uppercase ${stats.remaining > 0 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                            Sisa Izin: {stats.remaining}x
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 font-medium mb-5">{l.date} — "{l.reason}"</p>
                      {l.evidencePhoto && (
                        <button onClick={() => setSelectedPhoto(l.evidencePhoto!)} className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-800 flex items-center gap-2">
                          📸 Lihat Lampiran Foto
                        </button>
                      )}
                    </div>
                    <div className="flex w-full sm:w-auto gap-3">
                      <button onClick={() => onApproveLeave(l.id, 'APPROVED')} className="flex-1 sm:flex-none bg-indigo-600 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all">Setuju</button>
                      <button onClick={() => onApproveLeave(l.id, 'REJECTED')} className="flex-1 sm:flex-none bg-red-50 text-red-500 px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-red-100 hover:bg-red-500 hover:text-white transition-all">Tolak</button>
                    </div>
                  </div>
                );
            })}
            {leaveRequests.filter(l => l.status === 'PENDING').length === 0 && (
              <div className="text-center py-32 space-y-4">
                <div className="text-4xl opacity-20">📭</div>
                <p className="text-slate-400 font-bold text-sm">Tidak ada antrean pengajuan izin.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeMenu === 'employees' && (
        <div className="space-y-10">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Manajemen Staf</h2>
            <button onClick={() => { setEditingEmp(null); setEmpForm({ name: '', username: '', password: '', gapok: 0, uangMakan: 0, deductionRate: 0, payrollMethod: PayrollMethod.DAILY_30 }); setShowEmpModal(true); }} className="w-full sm:w-auto bg-slate-900 text-white px-10 py-5 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl hover:bg-indigo-600 active:scale-95 transition-all">+ Tambah Staf Baru</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {employees.filter(e => e.role === UserRole.EMPLOYEE).map(e => {
              const stats = getStatsForEmployee(e.id);
              return (
                <div key={e.id} className="p-8 bg-white border border-slate-100 rounded-[32px] shadow-sm hover:shadow-xl hover:shadow-slate-100 transition-all duration-300 space-y-6">
                  <div className="flex justify-between items-start">
                    <h4 className="text-xl font-black text-slate-900">{e.name}</h4>
                    <div className="flex space-x-3">
                      <button onClick={() => { setEditingEmp(e); setEmpForm(e); setShowEmpModal(true); }} className="text-indigo-600 font-black text-[10px] uppercase tracking-widest hover:underline">Edit</button>
                      <button onClick={() => onDeleteEmployee(e.id)} className="text-red-500 font-black text-[10px] uppercase tracking-widest hover:underline">Hapus</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-green-50 p-4 rounded-2xl">
                      <p className="text-[9px] font-black text-green-600 uppercase mb-1">Hadir</p>
                      <p className="text-lg font-black text-slate-900">{stats.onTime}</p>
                    </div>
                    <div className="bg-amber-50 p-4 rounded-2xl">
                      <p className="text-[9px] font-black text-amber-600 uppercase mb-1">Telat</p>
                      <p className="text-lg font-black text-slate-900">{stats.late}</p>
                    </div>
                    <div className="bg-indigo-50 p-4 rounded-2xl">
                      <p className="text-[9px] font-black text-indigo-600 uppercase mb-1">Izin</p>
                      <p className="text-lg font-black text-slate-900">{stats.leaves}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeMenu === 'attendance' && (
        <div className="space-y-10">
          <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Monitoring Absensi</h2>
          <div className="flex flex-col sm:flex-row justify-between items-end bg-slate-50 p-8 rounded-[32px] gap-6">
            <div className="grid grid-cols-2 gap-4 w-full">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Mulai</label>
                <input type="date" value={attStartDate} onChange={(e) => setAttStartDate(e.target.value)} className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-black text-sm outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Selesai</label>
                <input type="date" value={attEndDate} onChange={(e) => setAttEndDate(e.target.value)} className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-black text-sm outline-none" />
              </div>
            </div>
            <button onClick={() => exportAttendanceToPDF()} className="w-full sm:w-auto bg-slate-900 text-white px-10 py-5 rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-xl hover:bg-indigo-600 transition-all">Download Laporan PDF</button>
          </div>
          <div className="overflow-x-auto rounded-3xl border border-slate-100">
            <table className="w-full text-left min-w-[500px]">
              <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                <tr>
                  <th className="px-8 py-5">Karyawan</th>
                  <th className="px-8 py-5">Tanggal</th>
                  <th className="px-8 py-5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-sm">
                {getMergedAttendance().map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-5 font-black text-slate-800">{employees.find(e => e.id === item.userId)?.name}</td>
                    <td className="px-8 py-5 text-slate-500 font-bold">{item.date}</td>
                    <td className="px-8 py-5 text-right">
                      <span className={`px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-wide ${item.statusText.includes('HADIR') || item.statusText.includes('TEPAT') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{item.statusText}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeMenu === 'payroll' && (
        <div className="space-y-10">
          <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Siklus Payroll</h2>
          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-8 rounded-[32px]">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Dari Tanggal</label>
              <input type="date" value={payStartDate} onChange={(e) => setPayStartDate(e.target.value)} className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-black text-sm outline-none" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Hingga Tanggal</label>
              <input type="date" value={payEndDate} onChange={(e) => setPayEndDate(e.target.value)} className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-black text-sm outline-none" />
            </div>
          </div>
          <div className="space-y-6">
            {employees.filter(e => e.role === UserRole.EMPLOYEE).map(emp => {
              const report = getPayrollForUser(emp);
              const adj = payrollAdjustments[emp.id] || { bonus: 0, deduction: 0 };
              return (
                <div key={emp.id} className="p-10 bg-white border border-slate-100 rounded-[40px] shadow-sm hover:shadow-xl hover:shadow-slate-100 transition-all duration-300 space-y-8">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                    <div>
                      <h4 className="text-2xl font-black text-slate-900">{emp.name}</h4>
                      <div className="flex items-center gap-3 mt-2">
                         <span className="bg-indigo-50 text-indigo-600 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">{report.methodLabel}</span>
                         <span className="text-slate-400 text-[10px] font-black uppercase">Izin Sebulan: {report.monthlyLeaveCount}x</span>
                      </div>
                    </div>
                    <div className="text-left sm:text-right bg-slate-50 p-6 rounded-3xl w-full sm:w-auto">
                      <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">Gaji Diterima</p>
                      <p className="text-3xl font-black text-indigo-600">Rp {report.netSalary.toLocaleString('id-ID')}</p>
                      <button onClick={() => downloadIndividualSlip(emp)} className="text-[10px] font-black text-slate-900 underline uppercase tracking-widest mt-3 hover:text-indigo-600 transition-colors">Unduh Slip Individual</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-3">Bonus / Insentif</label>
                      <input type="number" value={adj.bonus || ''} placeholder="Rp 0" className="w-full p-5 bg-slate-50 border border-transparent focus:border-indigo-500 rounded-2xl font-bold text-sm outline-none transition-all" onChange={(e) => onUpdateAdjustment(emp.id, 'bonus', parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-3">Potongan Lainnya (Manual)</label>
                      <input type="number" value={adj.deduction || ''} placeholder="Rp 0" className="w-full p-5 bg-slate-50 border border-transparent focus:border-red-500 rounded-2xl font-bold text-sm outline-none transition-all" onChange={(e) => onUpdateAdjustment(emp.id, 'deduction', parseFloat(e.target.value) || 0)} />
                    </div>
                  </div>
                  <div className="pt-6 border-t border-slate-50 flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                     <p className="text-slate-400">Total Hari Izin Minggu Ini: {report.totalLeave} hari</p>
                     <p className="text-red-500">Total Potongan Minggu Ini: Rp {report.deductions.toLocaleString('id-ID')}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeMenu === 'settings' && (
        <div className="max-w-3xl space-y-10">
          <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Pengaturan Outlet</h2>
          <div className="space-y-10 bg-slate-50/50 border border-slate-100 p-10 lg:p-14 rounded-[48px]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Jam Masuk Standar</label>
                <input type="time" value={tempConfig.clockInTime} onChange={e => setTempConfig({...tempConfig, clockInTime: e.target.value})} className="w-full p-5 bg-white border border-slate-200 rounded-2xl font-black text-sm outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Radius Geofence (Meter)</label>
                <input type="number" value={tempConfig.radius} onChange={e => setTempConfig({...tempConfig, radius: parseInt(e.target.value) || 100})} className="w-full p-5 bg-white border border-slate-200 rounded-2xl font-black text-sm outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Latitude Lokasi</label>
                <input 
                  type="text" 
                  inputMode="decimal"
                  value={tempConfig.latitude} 
                  onChange={e => {
                    const val = e.target.value;
                    // Allow intermediate typing (like '-' or '.')
                    setTempConfig({...tempConfig, latitude: val as any});
                  }} 
                  onBlur={e => {
                    // Normalize to number on blur
                    const num = parseFloat(e.target.value) || 0;
                    setTempConfig({...tempConfig, latitude: num});
                  }}
                  className="w-full p-5 bg-white border border-slate-200 rounded-2xl font-black text-sm outline-none focus:border-indigo-500 transition-all" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Longitude Lokasi</label>
                <input 
                  type="text" 
                  inputMode="decimal"
                  value={tempConfig.longitude} 
                  onChange={e => {
                    const val = e.target.value;
                    setTempConfig({...tempConfig, longitude: val as any});
                  }} 
                  onBlur={e => {
                    const num = parseFloat(e.target.value) || 0;
                    setTempConfig({...tempConfig, longitude: num});
                  }}
                  className="w-full p-5 bg-white border border-slate-200 rounded-2xl font-black text-sm outline-none focus:border-indigo-500 transition-all" 
                />
              </div>
            </div>
            <div className="p-6 bg-amber-50 rounded-2xl border border-amber-100">
               <p className="text-[10px] font-bold text-amber-700 uppercase leading-relaxed tracking-wide">
                 ⚠️ Pastikan koordinat akurat. Jika tidak sesuai, karyawan tidak akan bisa melakukan absen masuk di lokasi outlet.
               </p>
            </div>
            <button onClick={handleSaveConfig} className="w-full bg-indigo-600 text-white py-6 rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-2xl hover:bg-indigo-700 active:scale-95 transition-all">Simpan Konfigurasi Sekarang</button>
          </div>
        </div>
      )}

      {selectedPhoto && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[100] flex flex-col items-center justify-center p-6" onClick={() => setSelectedPhoto(null)}>
           <div className="relative max-w-full max-h-[80vh] bg-white p-4 rounded-[40px] shadow-2xl">
              <img src={selectedPhoto} className="max-w-full max-h-[70vh] rounded-[28px] object-contain shadow-inner" alt="Bukti" />
           </div>
           <button className="mt-10 bg-white text-slate-900 px-12 py-4 rounded-full font-black uppercase text-[11px] tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-xl" onClick={() => setSelectedPhoto(null)}>Tutup Preview</button>
        </div>
      )}

      {showEmpModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[60] flex items-center justify-center p-6">
          <div className="bg-white rounded-[48px] w-full max-w-xl p-10 md:p-14 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-black text-slate-900 mb-8 text-center uppercase tracking-tight">Detail Profil Staf</h3>
            <div className="space-y-6">
              <div className="space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Nama Lengkap</label>
                 <input placeholder="Masukkan Nama..." value={empForm.name} onChange={e => setEmpForm({...empForm, name: e.target.value})} className="w-full p-5 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Username (Login)</label>
                  <input placeholder="Username..." value={empForm.username} onChange={e => setEmpForm({...empForm, username: e.target.value})} className="w-full p-5 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Password</label>
                  <input type="password" placeholder="Password..." value={empForm.password} onChange={e => setEmpForm({...empForm, password: e.target.value})} className="w-full p-5 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Gapok</label>
                  <input type="number" placeholder="Rp" value={empForm.gapok} onChange={e => setEmpForm({...empForm, gapok: parseInt(e.target.value) || 0})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-xs outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Makan</label>
                  <input type="number" placeholder="Rp" value={empForm.uangMakan} onChange={e => setEmpForm({...empForm, uangMakan: parseInt(e.target.value) || 0})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-xs outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Potongan</label>
                  <input type="number" placeholder="Rp" value={empForm.deductionRate} onChange={e => setEmpForm({...empForm, deductionRate: parseInt(e.target.value) || 0})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-xs outline-none" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Metode Payroll</label>
                <select value={empForm.payrollMethod} onChange={e => setEmpForm({...empForm, payrollMethod: e.target.value as PayrollMethod})} className="w-full p-5 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none appearance-none">
                  <option value={PayrollMethod.DAILY_30}>Harian (Total / 30 Hari)</option>
                  <option value={PayrollMethod.FIXED_4}>Mingguan (Total / 4 Minggu)</option>
                </select>
              </div>
              <div className="flex gap-4 pt-8">
                <button onClick={() => setShowEmpModal(false)} className="flex-1 py-5 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[11px] tracking-widest hover:bg-slate-200 transition-all">Batalkan</button>
                <button onClick={() => { if(editingEmp) onEditEmployee({...editingEmp, ...empForm} as User); else onAddEmployee(empForm); setShowEmpModal(false); }} className="flex-1 py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all">Simpan Data</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OwnerDashboard;
