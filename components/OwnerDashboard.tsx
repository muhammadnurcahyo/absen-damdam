
import React, { useState, useEffect } from 'react';
import { User, AttendanceRecord, LeaveRequest, OutletConfig, UserRole, PayrollMethod } from '../types';
import { calculateWeeklyPayroll } from '../services/payrollService';
import { FREE_LEAVE_QUOTA } from '../constants';

interface OwnerDashboardProps {
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
  const [activeMenu, setActiveMenu] = useState<'dashboard' | 'employees' | 'attendance' | 'payroll' | 'settings'>('dashboard');
  const [attStartDate, setAttStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [attEndDate, setAttEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [payStartDate, setPayStartDate] = useState('');
  const [payEndDate, setPayEndDate] = useState('');
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<User | null>(null);
  const [empForm, setEmpForm] = useState<Partial<User>>({ 
    name: '', username: '', password: '', gapok: 0, uangMakan: 0, deductionRate: 0, payrollMethod: PayrollMethod.DAILY_30 
  });
  const [tempConfig, setTempConfig] = useState(outletConfig);
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

  const SidebarItem = ({ icon, label, id }: { icon: string, label: string, id: typeof activeMenu }) => (
    <button
      onClick={() => setActiveMenu(id)}
      className={`whitespace-nowrap flex items-center space-x-2 px-6 py-4 rounded-2xl transition-all ${
        activeMenu === id ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-500 hover:bg-slate-50'
      }`}
    >
      <span className="text-lg">{icon}</span>
      <span className="font-black text-[10px] uppercase tracking-widest">{label}</span>
    </button>
  );

  return (
    <div className="flex flex-col md:flex-row gap-6 md:gap-8">
      <aside className="w-full md:w-64 flex md:flex-col overflow-x-auto md:overflow-visible gap-2 pb-2 md:pb-0 scrollbar-hide">
        <SidebarItem icon="📊" label="Persetujuan" id="dashboard" />
        <SidebarItem icon="👥" label="Karyawan" id="employees" />
        <SidebarItem icon="📅" label="Monitoring" id="attendance" />
        <SidebarItem icon="💰" label="Payroll" id="payroll" />
        <SidebarItem icon="⚙️" label="Pengaturan" id="settings" />
      </aside>

      <div className="flex-1 bg-white rounded-[32px] md:rounded-[48px] border border-slate-100 shadow-sm p-6 md:p-10 min-h-[600px]">
        {activeMenu === 'dashboard' && (
          <div className="space-y-8">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Persetujuan Izin</h2>
            <div className="space-y-4">
              {leaveRequests.filter(l => l.status === 'PENDING').map(l => {
                  const stats = getStatsForEmployee(l.userId);
                  return (
                    <div key={l.id} className="p-6 bg-slate-50 rounded-[24px] border border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <p className="font-black text-slate-900 text-base">{employees.find(e => e.id === l.userId)?.name}</p>
                          <span className={`text-[8px] px-2 py-1 rounded-full font-black uppercase ${stats.remaining > 0 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                              Sisa Izin: {stats.remaining}x
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mb-4">{l.date} — "{l.reason}"</p>
                        {l.evidencePhoto && (
                          <button onClick={() => setSelectedPhoto(l.evidencePhoto!)} className="text-[9px] font-black text-indigo-600 uppercase tracking-widest hover:underline flex items-center">
                            📸 Lihat Bukti Foto
                          </button>
                        )}
                      </div>
                      <div className="flex w-full sm:w-auto space-x-2">
                        <button onClick={() => onApproveLeave(l.id, 'APPROVED')} className="flex-1 sm:flex-none bg-indigo-600 text-white px-6 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all">Setuju</button>
                        <button onClick={() => onApproveLeave(l.id, 'REJECTED')} className="flex-1 sm:flex-none bg-red-500 text-white px-6 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all">Tolak</button>
                      </div>
                    </div>
                  );
              })}
              {leaveRequests.filter(l => l.status === 'PENDING').length === 0 && <p className="text-slate-400 italic text-center py-20 text-sm font-bold">Tidak ada antrean pengajuan.</p>}
            </div>
          </div>
        )}

        {activeMenu === 'employees' && (
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Manajemen Staf</h2>
              <button onClick={() => { setEditingEmp(null); setEmpForm({ name: '', username: '', password: '', gapok: 0, uangMakan: 0, deductionRate: 0, payrollMethod: PayrollMethod.DAILY_30 }); setShowEmpModal(true); }} className="w-full sm:w-auto bg-indigo-600 text-white px-8 py-4 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg">+ Tambah Staf</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {employees.filter(e => e.role === UserRole.EMPLOYEE).map(e => {
                const stats = getStatsForEmployee(e.id);
                return (
                  <div key={e.id} className="p-6 bg-white border border-slate-100 rounded-[24px] shadow-sm space-y-4">
                    <div className="flex justify-between items-start">
                      <h4 className="text-lg font-black text-slate-900">{e.name}</h4>
                      <div className="flex space-x-2">
                        <button onClick={() => { setEditingEmp(e); setEmpForm(e); setShowEmpModal(true); }} className="text-indigo-600 font-black text-[9px] uppercase">Edit</button>
                        <button onClick={() => onDeleteEmployee(e.id)} className="text-red-500 font-black text-[9px] uppercase">Hapus</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-[8px] font-black uppercase tracking-tighter">
                      <div className="bg-green-50 p-3 rounded-xl">
                        <p className="text-green-600">Tepat</p>
                        <p className="text-slate-900 text-sm mt-1">{stats.onTime}</p>
                      </div>
                      <div className="bg-amber-50 p-3 rounded-xl">
                        <p className="text-amber-600">Telat</p>
                        <p className="text-slate-900 text-sm mt-1">{stats.late}</p>
                      </div>
                      <div className="bg-indigo-50 p-3 rounded-xl">
                        <p className="text-indigo-600">Izin</p>
                        <p className="text-slate-900 text-sm mt-1">{stats.leaves}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeMenu === 'attendance' && (
          <div className="space-y-8">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Monitoring Absensi</h2>
            <div className="flex flex-col sm:flex-row justify-between items-end bg-slate-50 p-6 rounded-[24px] gap-4">
              <div className="grid grid-cols-2 gap-2 w-full">
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase">Dari</label>
                  <input type="date" value={attStartDate} onChange={(e) => setAttStartDate(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl font-black text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase">Sampai</label>
                  <input type="date" value={attEndDate} onChange={(e) => setAttEndDate(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl font-black text-xs" />
                </div>
              </div>
              <button onClick={() => (window as any).jspdf && getMergedAttendance().length > 0 && exportAttendanceToPDF()} className="w-full sm:w-auto bg-slate-900 text-white px-8 py-3.5 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl">Export PDF</button>
            </div>
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <table className="w-full text-left min-w-[450px]">
                <thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-400 tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Karyawan</th>
                    <th className="px-6 py-4">Tanggal</th>
                    <th className="px-6 py-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {getMergedAttendance().map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="px-6 py-4 font-black text-slate-800 text-xs">{employees.find(e => e.id === item.userId)?.name}</td>
                      <td className="px-6 py-4 text-slate-500 font-bold text-[10px]">{item.date}</td>
                      <td className="px-6 py-4 text-right">
                        <span className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase ${item.statusText.includes('HADIR') || item.statusText.includes('TEPAT') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{item.statusText}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeMenu === 'payroll' && (
          <div className="space-y-8">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Siklus Payroll</h2>
            <div className="grid grid-cols-2 gap-2 bg-slate-50 p-6 rounded-[24px]">
              <input type="date" value={payStartDate} onChange={(e) => setPayStartDate(e.target.value)} className="p-4 bg-white border border-slate-200 rounded-xl font-black text-xs outline-none" />
              <input type="date" value={payEndDate} onChange={(e) => setPayEndDate(e.target.value)} className="p-4 bg-white border border-slate-200 rounded-xl font-black text-xs outline-none" />
            </div>
            <div className="space-y-4">
              {employees.filter(e => e.role === UserRole.EMPLOYEE).map(emp => {
                const report = getPayrollForUser(emp);
                const adj = payrollAdjustments[emp.id] || { bonus: 0, deduction: 0 };
                return (
                  <div key={emp.id} className="p-6 bg-white border border-slate-100 rounded-[24px] shadow-sm space-y-6">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="text-lg font-black text-slate-900">{emp.name}</h4>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">{report.methodLabel}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-black text-indigo-700">Rp {report.netSalary.toLocaleString('id-ID')}</p>
                        <button onClick={() => downloadIndividualSlip(emp)} className="text-[9px] font-black text-indigo-600 uppercase tracking-widest mt-1 hover:underline">Unduh Slip Individual</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase ml-1">Bonus</label>
                        <input type="number" value={adj.bonus} placeholder="Rp 0" className="w-full p-4 bg-slate-50 rounded-xl font-bold text-xs outline-none focus:border-indigo-500 border border-transparent" onChange={(e) => onUpdateAdjustment(emp.id, 'bonus', parseFloat(e.target.value) || 0)} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase ml-1">Potongan Lain</label>
                        <input type="number" value={adj.deduction} placeholder="Rp 0" className="w-full p-4 bg-slate-50 rounded-xl font-bold text-xs outline-none focus:border-red-500 border border-transparent" onChange={(e) => onUpdateAdjustment(emp.id, 'deduction', parseFloat(e.target.value) || 0)} />
                      </div>
                    </div>
                    <div className="pt-4 border-t border-slate-50 flex justify-between items-center text-[9px] font-bold uppercase">
                       <p className="text-slate-400">Total Izin Sebulan: {report.monthlyLeaveCount} kali</p>
                       <p className="text-red-500">Potongan Minggu Ini: Rp {report.deductions.toLocaleString('id-ID')}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeMenu === 'settings' && (
          <div className="max-w-2xl space-y-8">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Pengaturan Outlet</h2>
            <div className="space-y-8 bg-white border border-slate-200 p-8 rounded-[32px] shadow-sm">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[8px] font-black uppercase text-slate-400 tracking-widest ml-1">Jam Masuk</label>
                  <input type="time" value={tempConfig.clockInTime} onChange={e => setTempConfig({...tempConfig, clockInTime: e.target.value})} className="w-full p-4 border border-slate-200 rounded-xl font-black text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black uppercase text-slate-400 tracking-widest ml-1">Radius (M)</label>
                  <input type="number" value={tempConfig.radius} onChange={e => setTempConfig({...tempConfig, radius: parseInt(e.target.value)})} className="w-full p-4 border border-slate-200 rounded-xl font-black text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[8px] font-black uppercase text-slate-400 tracking-widest ml-1">Latitude</label>
                  <input type="number" step="any" value={tempConfig.latitude} onChange={e => setTempConfig({...tempConfig, latitude: parseFloat(e.target.value)})} className="w-full p-4 border border-slate-200 rounded-xl font-black text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black uppercase text-slate-400 tracking-widest ml-1">Longitude</label>
                  <input type="number" step="any" value={tempConfig.longitude} onChange={e => setTempConfig({...tempConfig, longitude: parseFloat(e.target.value)})} className="w-full p-4 border border-slate-200 rounded-xl font-black text-sm" />
                </div>
              </div>
              <button onClick={() => { onUpdateConfig(tempConfig); alert('Tersimpan!'); }} className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all">Simpan Konfigurasi</button>
            </div>
          </div>
        )}
      </div>

      {selectedPhoto && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[100] flex flex-col items-center justify-center p-4" onClick={() => setSelectedPhoto(null)}>
           <div className="relative max-w-full max-h-[80vh] bg-white p-2 rounded-2xl shadow-2xl">
              <img src={selectedPhoto} className="max-w-full max-h-[75vh] rounded-xl object-contain" alt="Bukti" />
           </div>
           <button className="mt-8 bg-white text-slate-900 px-8 py-3 rounded-full font-black uppercase text-[10px] tracking-widest" onClick={() => setSelectedPhoto(null)}>Tutup Preview</button>
        </div>
      )}

      {showEmpModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-md z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] w-full max-w-lg p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-black text-slate-900 mb-6 text-center uppercase">Profil Staf</h3>
            <div className="space-y-4">
              <input placeholder="Nama Lengkap" value={empForm.name} onChange={e => setEmpForm({...empForm, name: e.target.value})} className="w-full p-4 border border-slate-200 rounded-xl font-black text-sm" />
              <div className="grid grid-cols-2 gap-4">
                <input placeholder="User ID" value={empForm.username} onChange={e => setEmpForm({...empForm, username: e.target.value})} className="w-full p-4 border border-slate-200 rounded-xl font-black text-sm" />
                <input placeholder="Password" value={empForm.password} onChange={e => setEmpForm({...empForm, password: e.target.value})} className="w-full p-4 border border-slate-200 rounded-xl font-black text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input type="number" placeholder="Gapok" value={empForm.gapok} onChange={e => setEmpForm({...empForm, gapok: parseInt(e.target.value) || 0})} className="w-full p-4 border border-slate-200 rounded-xl font-black text-xs" />
                <input type="number" placeholder="Makan" value={empForm.uangMakan} onChange={e => setEmpForm({...empForm, uangMakan: parseInt(e.target.value) || 0})} className="w-full p-4 border border-slate-200 rounded-xl font-black text-xs" />
                <input type="number" placeholder="Potongan" value={empForm.deductionRate} onChange={e => setEmpForm({...empForm, deductionRate: parseInt(e.target.value) || 0})} className="w-full p-4 border border-slate-200 rounded-xl font-black text-xs" />
              </div>
              <select value={empForm.payrollMethod} onChange={e => setEmpForm({...empForm, payrollMethod: e.target.value as PayrollMethod})} className="w-full p-4 border border-slate-200 rounded-xl font-black text-sm">
                <option value={PayrollMethod.DAILY_30}>Harian (Bagi 30)</option>
                <option value={PayrollMethod.FIXED_4}>Mingguan (Bagi 4)</option>
              </select>
              <div className="flex gap-3 pt-6">
                <button onClick={() => setShowEmpModal(false)} className="flex-1 py-4 bg-slate-100 rounded-xl font-black uppercase text-[10px]">Batal</button>
                <button onClick={() => { if(editingEmp) onEditEmployee({...editingEmp, ...empForm} as User); else onAddEmployee(empForm); setShowEmpModal(false); }} className="flex-1 py-4 bg-indigo-600 text-white rounded-xl font-black uppercase text-[10px] shadow-lg">Simpan</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OwnerDashboard;
