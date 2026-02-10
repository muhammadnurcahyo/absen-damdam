
import React, { useState, useEffect } from 'react';
import { User, AttendanceRecord, LeaveRequest, OutletConfig, UserRole, PayrollMethod } from '../types';
import { calculateWeeklyPayroll } from '../services/payrollService';
import { FREE_LEAVE_QUOTA } from '../constants';
import { getCurrentPosition } from '../services/locationService';

interface OwnerDashboardProps {
  activeMenu: 'dashboard' | 'employees' | 'attendance' | 'payroll' | 'settings' | 'kasbon';
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
  onUpdateKasbon: (userId: string, amount: number) => void;
  onRefreshData?: () => void;
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
  onUpdateAdjustment,
  onUpdateKasbon,
  onRefreshData
}) => {
  const [attStartDate, setAttStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [attEndDate, setAttEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [payStartDate, setPayStartDate] = useState('');
  const [payEndDate, setPayEndDate] = useState('');
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<User | null>(null);
  const [empForm, setEmpForm] = useState<Partial<User>>({ 
    name: '', username: '', password: '', gapok: 0, uangMakan: 0, deductionRate: 0, payrollMethod: PayrollMethod.DAILY_30, totalKasbon: 0
  });
  const [tempConfig, setTempConfig] = useState<OutletConfig>(outletConfig);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [kasbonInputs, setKasbonInputs] = useState<Record<string, number>>({});
  const [isGettingLocation, setIsGettingLocation] = useState(false);

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

  useEffect(() => {
    setTempConfig(outletConfig);
  }, [outletConfig]);

  const handleGetCurrentLocation = async () => {
    setIsGettingLocation(true);
    try {
      const pos = await getCurrentPosition();
      setTempConfig({
        ...tempConfig,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude
      });
      alert('Koordinat berhasil diambil dari lokasi Anda saat ini!');
    } catch (err) {
      alert('Gagal mengambil lokasi. Pastikan GPS aktif.');
    } finally {
      setIsGettingLocation(false);
    }
  };

  const getStatsForEmployee = (userId: string) => {
    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthRecs = attendance.filter(a => 
      a.userId === userId && 
      a.date.startsWith(currentMonthStr)
    );
    
    // Use unique dates to avoid overcounting if duplicates exist in state
    const presentDates = new Set(monthRecs.filter(a => a.status === 'PRESENT' && !a.isLate).map(a => a.date));
    const lateDates = new Set(monthRecs.filter(a => a.status === 'PRESENT' && a.isLate).map(a => a.date));
    const leaveDates = new Set(monthRecs.filter(a => a.status === 'LEAVE' || a.status === 'ABSENT' || a.status === 'LEAVE_PENDING').map(a => a.date));

    const onTime = presentDates.size;
    const late = lateDates.size;
    const leaves = leaveDates.size;
    const remaining = Math.max(0, FREE_LEAVE_QUOTA - leaves);
    
    return { onTime, late, leaves, remaining };
  };

  const getPayrollForUser = (user: User) => {
    if (!payStartDate || !payEndDate) return null;
    
    const start = new Date(payStartDate);
    const end = new Date(payEndDate);
    
    // Kirim seluruh records user agar service bisa menghitung kuota bulanan dengan akurat
    const userAllRecords = attendance.filter(a => a.userId === user.id);
    
    const adj = payrollAdjustments[user.id] || { bonus: 0, deduction: 0 };
    return calculateWeeklyPayroll(user, userAllRecords, userAllRecords, start, end, adj.bonus, adj.deduction);
  };

  const downloadIndividualSlip = (emp: User) => {
    const report = getPayrollForUser(emp);
    if (!report) return alert("Pilih tanggal periode terlebih dahulu!");
    
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
    doc.text(`Akumulasi Izin Bulan Ini: ${report.monthlyLeaveCount} kali`, 14, 59);
    doc.text(`Sisa Kasbon: Rp ${report.totalKasbon.toLocaleString('id-ID')}`, 14, 66);
    doc.setFont("helvetica", "normal");

    const deductionLabel = emp.uangMakan > 0 ? 'Potongan Kehadiran' : 'Potongan Gaji';
    (doc as any).autoTable({
      startY: 75,
      head: [['DESKRIPSI', 'DETAIL', 'JUMLAH']],
      body: [
        ['Gaji Kotor Mingguan', report.methodLabel, `Rp ${report.grossSalary.toLocaleString('id-ID')}`],
        ['Bonus Mingguan', 'Ditambahkan Owner', `Rp ${report.bonus.toLocaleString('id-ID')}`],
        [deductionLabel, `${report.totalLeave} Izin Minggu Ini`, `Rp ${(report.deductions - report.manualDeduction).toLocaleString('id-ID')}`],
        ['Potongan Kasbon / Lainnya', 'Dipotong dari Gaji', `Rp ${report.manualDeduction.toLocaleString('id-ID')}`],
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

  const getMergedAttendance = () => {
    const dailyAtt = attendance.filter(a => a.date >= attStartDate && a.date <= attEndDate);
    const combinedMap = new Map<string, any>();
    
    dailyAtt.forEach(a => {
      const key = `${a.userId}-${a.date}`;
      let statusText = a.status === 'PRESENT' ? (a.isLate ? 'TERLAMBAT' : 'HADIR') : 
                      a.status === 'LEAVE_PENDING' ? 'MENUNGGU' : 
                      a.status === 'LEAVE' ? 'IZIN' : 'ABSEN';
      
      // If duplicate records exist for the same user and date, prioritize leave/present over absent
      const existing = combinedMap.get(key);
      if (!existing || a.status !== 'ABSENT') {
        combinedMap.set(key, { ...a, statusText });
      }
    });
    
    return Array.from(combinedMap.values()).sort((a, b) => b.date.localeCompare(a.date));
  };

  const exportAttendanceToPDF = () => {
    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF();
    const data = getMergedAttendance();
    doc.setFontSize(20);
    doc.setTextColor(79, 70, 229);
    doc.text("DamDam Laundry - Laporan Absensi", 105, 20, { align: 'center' });
    (doc as any).autoTable({
      startY: 35,
      head: [['KARYAWAN', 'TANGGAL', 'STATUS', 'KOORDINAT']],
      body: data.map(item => [
        employees.find(e => e.id === item.userId)?.name || 'Unknown',
        item.date,
        item.statusText,
        item.latitude && item.longitude ? `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}` : '-'
      ]),
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] }
    });
    doc.save(`absensi_${attStartDate}.pdf`);
  };

  const handleSaveConfig = () => {
    onUpdateConfig(tempConfig);
    alert('Konfigurasi berhasil disimpan!');
  };

  const handlePayKasbon = (userId: string) => {
    const adj = payrollAdjustments[userId];
    if (adj && adj.deduction > 0) {
      if (confirm(`Konfirmasi: Potong gaji karyawan sebesar Rp ${adj.deduction.toLocaleString('id-ID')} untuk membayar kasbon?`)) {
        onUpdateKasbon(userId, -adj.deduction);
        alert('Saldo Kasbon di database berhasil dikurangi sesuai nominal potongan gaji!');
      }
    } else {
      alert('Masukkan nominal potongan terlebih dahulu di kolom "Potongan Kasbon/Lainnya".');
    }
  };

  const pendingLeaves = leaveRequests.filter(l => l.status === 'PENDING');

  return (
    <div className="bg-white rounded-[40px] lg:rounded-[56px] border border-slate-100 shadow-sm p-8 lg:p-14 min-h-[600px]">
      {activeMenu === 'dashboard' && (
        <div className="space-y-10">
          <div className="flex justify-between items-center">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Persetujuan Izin</h2>
            <button onClick={onRefreshData} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">🔄 Segarkan</button>
          </div>
          <div className="grid gap-6">
            {pendingLeaves.map(l => {
                const stats = getStatsForEmployee(l.userId);
                return (
                  <div key={l.id} className="p-8 bg-slate-50 rounded-[32px] border border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-8 hover:bg-white hover:shadow-xl transition-all duration-300">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-3">
                        <p className="font-black text-slate-900 text-xl">{employees.find(e => e.id === l.userId)?.name}</p>
                        <span className={`text-[9px] px-3 py-1.5 rounded-full font-black uppercase ${stats.remaining > 0 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>Sisa Izin: {stats.remaining}x</span>
                      </div>
                      <p className="text-sm text-slate-500 font-medium mb-5">{l.date} — "{l.reason}"</p>
                      {l.evidencePhoto && <button onClick={() => setSelectedPhoto(l.evidencePhoto!)} className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">📸 Lihat Lampiran</button>}
                    </div>
                    <div className="flex w-full sm:w-auto gap-3">
                      <button onClick={() => onApproveLeave(l.id, 'APPROVED')} className="flex-1 sm:flex-none bg-indigo-600 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all">Setuju</button>
                      <button onClick={() => onApproveLeave(l.id, 'REJECTED')} className="flex-1 sm:flex-none bg-red-50 text-red-500 px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-red-100 hover:bg-red-500 hover:text-white transition-all">Tolak</button>
                    </div>
                  </div>
                );
            })}
            {pendingLeaves.length === 0 && <div className="text-center py-32 text-slate-400 font-bold text-sm">Tidak ada antrean pengajuan izin.</div>}
          </div>
        </div>
      )}

      {activeMenu === 'employees' && (
        <div className="space-y-10">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Manajemen Staf</h2>
            <button onClick={() => { setEditingEmp(null); setEmpForm({ name: '', username: '', password: '', gapok: 0, uangMakan: 0, deductionRate: 0, payrollMethod: PayrollMethod.DAILY_30, totalKasbon: 0 }); setShowEmpModal(true); }} className="w-full sm:w-auto bg-slate-900 text-white px-10 py-5 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl hover:bg-indigo-600 transition-all">+ Tambah Staf</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {employees.filter(e => e.role === UserRole.EMPLOYEE).map(e => {
              const stats = getStatsForEmployee(e.id);
              return (
                <div key={e.id} className="p-8 bg-white border border-slate-100 rounded-[32px] shadow-sm hover:shadow-xl transition-all duration-300 space-y-6">
                  <div className="flex justify-between items-start">
                    <h4 className="text-xl font-black text-slate-900">{e.name}</h4>
                    <div className="flex space-x-3">
                      <button onClick={() => { setEditingEmp(e); setEmpForm(e); setShowEmpModal(true); }} className="text-indigo-600 font-black text-[10px] uppercase tracking-widest">Edit</button>
                      <button onClick={() => onDeleteEmployee(e.id)} className="text-red-500 font-black text-[10px] uppercase tracking-widest">Hapus</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-green-50 p-4 rounded-2xl"><p className="text-[9px] font-black text-green-600 uppercase mb-1">Hadir</p><p className="text-lg font-black">{stats.onTime}</p></div>
                    <div className="bg-amber-50 p-4 rounded-2xl"><p className="text-[9px] font-black text-amber-600 uppercase mb-1">Telat</p><p className="text-lg font-black">{stats.late}</p></div>
                    <div className="bg-indigo-50 p-4 rounded-2xl"><p className="text-[9px] font-black text-indigo-600 uppercase mb-1">Izin</p><p className="text-lg font-black">{stats.leaves}</p></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeMenu === 'kasbon' && (
        <div className="space-y-10">
          <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Manajemen Kasbon</h2>
          <div className="grid gap-6">
            {employees.filter(e => e.role === UserRole.EMPLOYEE).map(emp => (
              <div key={emp.id} className="p-8 bg-slate-50 rounded-[32px] border border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-8">
                <div className="flex-1">
                  <h4 className="text-xl font-black text-slate-900 mb-1">{emp.name}</h4>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo Kasbon Saat Ini</p>
                  <p className="text-2xl font-black text-red-600 mt-2">Rp {emp.totalKasbon.toLocaleString('id-ID')}</p>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
                  <div className="relative w-full sm:w-48">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">Rp</span>
                    <input type="number" placeholder="Nominal..." value={kasbonInputs[emp.id] || ''} onChange={e => setKasbonInputs({...kasbonInputs, [emp.id]: parseFloat(e.target.value) || 0})} className="w-full pl-10 pr-4 py-4 bg-white border border-slate-200 rounded-2xl font-bold text-sm outline-none" />
                  </div>
                  <button onClick={() => { const amt = kasbonInputs[emp.id] || 0; if(amt > 0) { onUpdateKasbon(emp.id, amt); setKasbonInputs({...kasbonInputs, [emp.id]: 0}); alert('Berhasil ditambahkan.'); } }} className="w-full sm:w-auto bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase shadow-lg transition-all">Tambah Hutang</button>
                  <button onClick={() => { const amt = kasbonInputs[emp.id] || 0; if(amt > 0) { onUpdateKasbon(emp.id, -amt); setKasbonInputs({...kasbonInputs, [emp.id]: 0}); alert('Bayar manual dicatat.'); } }} className="w-full sm:w-auto bg-white border border-slate-200 text-slate-600 px-8 py-4 rounded-2xl font-black text-[10px] uppercase transition-all">Bayar Manual</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeMenu === 'attendance' && (
        <div className="space-y-10">
          <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Monitoring Absensi</h2>
          <div className="flex flex-col sm:flex-row justify-between items-end bg-slate-50 p-8 rounded-[32px] gap-6">
            <div className="grid grid-cols-2 gap-4 w-full">
              <input type="date" value={attStartDate} onChange={(e) => setAttStartDate(e.target.value)} className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-black text-sm" />
              <input type="date" value={attEndDate} onChange={(e) => setAttEndDate(e.target.value)} className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-black text-sm" />
            </div>
            <button onClick={() => exportAttendanceToPDF()} className="w-full sm:w-auto bg-slate-900 text-white px-10 py-5 rounded-2xl font-black uppercase text-[11px] transition-all">Download PDF</button>
          </div>
          <div className="overflow-x-auto rounded-3xl border border-slate-100">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400">
                <tr>
                  <th className="px-8 py-5">Staf</th>
                  <th className="px-8 py-5">Tanggal</th>
                  <th className="px-8 py-5">Lokasi</th>
                  <th className="px-8 py-5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-sm">
                {getMergedAttendance().map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="px-8 py-5 font-black">{employees.find(e => e.id === item.userId)?.name}</td>
                    <td className="px-8 py-5 text-slate-500">{item.date}</td>
                    <td className="px-8 py-5">
                      {item.latitude && item.longitude ? (
                        <a 
                          href={`https://www.google.com/maps?q=${item.latitude},${item.longitude}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-indigo-600 hover:underline flex items-center gap-1 font-bold text-xs"
                        >
                          📍 Lihat di Peta
                        </a>
                      ) : (
                        <span className="text-slate-300 font-bold text-xs">-</span>
                      )}
                    </td>
                    <td className="px-8 py-5 text-right"><span className={`px-4 py-2 rounded-full text-[9px] font-black uppercase ${item.statusText.includes('HADIR') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{item.statusText}</span></td>
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
            <input type="date" value={payStartDate} onChange={(e) => setPayStartDate(e.target.value)} className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-black text-sm" />
            <input type="date" value={payEndDate} onChange={(e) => setPayEndDate(e.target.value)} className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-black text-sm" />
          </div>
          <div className="space-y-6">
            {employees.filter(e => e.role === UserRole.EMPLOYEE).map(emp => {
              const report = getPayrollForUser(emp);
              if (!report) return null;
              
              const adj = payrollAdjustments[emp.id] || { bonus: 0, deduction: 0 };
              return (
                <div key={emp.id} className="p-10 bg-white border border-slate-100 rounded-[40px] shadow-sm hover:shadow-xl transition-all duration-300 space-y-8">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                    <div>
                      <h4 className="text-2xl font-black text-slate-900">{emp.name}</h4>
                      <div className="flex flex-wrap items-center gap-3 mt-2">
                         <span className="bg-indigo-50 text-indigo-600 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">{report.methodLabel}</span>
                         <span className="text-slate-400 text-[10px] font-black uppercase">Akumulasi Izin Bln Ini: {report.monthlyLeaveCount}x</span>
                         <span className="text-red-500 text-[10px] font-black uppercase">Saldo Kasbon: Rp {emp.totalKasbon.toLocaleString('id-ID')}</span>
                      </div>
                    </div>
                    <div className="text-left sm:text-right bg-slate-50 p-6 rounded-3xl w-full sm:w-auto">
                      <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">Gaji Bersih (Akan Diterima)</p>
                      <p className="text-3xl font-black text-indigo-600">Rp {report.netSalary.toLocaleString('id-ID')}</p>
                      <button onClick={() => downloadIndividualSlip(emp)} className="text-[10px] font-black text-slate-900 underline uppercase tracking-widest mt-3">Slip PDF</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Bonus / Insentif</label>
                      <input type="number" value={adj.bonus || ''} placeholder="0" className="w-full p-5 bg-slate-50 rounded-2xl font-bold text-sm outline-none" onChange={(e) => onUpdateAdjustment(emp.id, 'bonus', parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Potongan Kasbon / Lainnya</label>
                      <div className="flex gap-2">
                        <input type="number" value={adj.deduction || ''} placeholder="0" className="flex-1 p-5 bg-slate-50 rounded-2xl font-bold text-sm outline-none" onChange={(e) => onUpdateAdjustment(emp.id, 'deduction', parseFloat(e.target.value) || 0)} />
                        <button onClick={() => handlePayKasbon(emp.id)} className="bg-red-500 hover:bg-red-600 text-white px-6 py-5 rounded-2xl font-black text-[10px] uppercase shadow-lg transition-all active:scale-95">Bayar Kasbon</button>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50">
                    <p className="text-[10px] font-bold text-indigo-700 leading-relaxed uppercase tracking-tight">
                      ℹ️ Gaji bersih dipotong berdasarkan akumulasi izin bulan ini ({report.monthlyLeaveCount} hari) sesuai aturan karyawan. Klik "Bayar Kasbon" untuk mengurangi saldo hutang di database.
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeMenu === 'settings' && (
        <div className="max-w-3xl space-y-10">
          <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Sistem Outlet</h2>
          <div className="space-y-10 bg-slate-50 p-10 lg:p-14 rounded-[48px]">
            <div className="flex justify-between items-center mb-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Lokasi & Waktu Presensi</p>
              <button 
                onClick={handleGetCurrentLocation}
                disabled={isGettingLocation}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all flex items-center gap-2 shadow-lg shadow-indigo-100 active:scale-95"
              >
                {isGettingLocation ? '⏳ Mengambil...' : '📍 Gunakan Lokasi Saya Sekarang'}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Latitude Toko</label>
                <input type="number" value={tempConfig.latitude} onChange={e => setTempConfig({...tempConfig, latitude: parseFloat(e.target.value) || 0})} className="w-full p-5 bg-white border border-slate-200 rounded-2xl font-black text-sm" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Longitude Toko</label>
                <input type="number" value={tempConfig.longitude} onChange={e => setTempConfig({...tempConfig, longitude: parseFloat(e.target.value) || 0})} className="w-full p-5 bg-white border border-slate-200 rounded-2xl font-black text-sm" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Jam Masuk</label>
                <input type="time" value={tempConfig.clockInTime} onChange={e => setTempConfig({...tempConfig, clockInTime: e.target.value})} className="w-full p-5 bg-white border border-slate-200 rounded-2xl font-black text-sm" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Radius Absen (Meter)</label>
                <input type="number" value={tempConfig.radius} onChange={e => setTempConfig({...tempConfig, radius: parseInt(e.target.value) || 100})} className="w-full p-5 bg-white border border-slate-200 rounded-2xl font-black text-sm" />
              </div>
            </div>
            <button onClick={handleSaveConfig} className="w-full bg-indigo-600 text-white py-6 rounded-2xl font-black uppercase text-[11px] shadow-2xl transition-all">Simpan Konfigurasi</button>
          </div>
        </div>
      )}

      {selectedPhoto && <div className="fixed inset-0 bg-slate-900/90 flex flex-col items-center justify-center p-6 z-[100]" onClick={() => setSelectedPhoto(null)}><img src={selectedPhoto} className="max-w-full max-h-[70vh] rounded-[28px] shadow-2xl" /><button className="mt-10 bg-white px-12 py-4 rounded-full font-black uppercase text-[11px]">Tutup</button></div>}

      {showEmpModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[60] flex items-center justify-center p-6">
          <div className="bg-white rounded-[48px] w-full max-w-xl p-10 md:p-14 shadow-2xl">
            <h3 className="text-2xl font-black text-slate-900 mb-8 text-center uppercase">Profil Staf</h3>
            <div className="space-y-6">
              <input placeholder="Nama..." value={empForm.name} onChange={e => setEmpForm({...empForm, name: e.target.value})} className="w-full p-5 bg-slate-50 rounded-2xl font-bold" />
              <div className="grid grid-cols-2 gap-4">
                <input placeholder="User..." value={empForm.username} onChange={e => setEmpForm({...empForm, username: e.target.value})} className="w-full p-5 bg-slate-50 rounded-2xl font-bold" />
                <input type="password" placeholder="Pass..." value={empForm.password} onChange={e => setEmpForm({...empForm, password: e.target.value})} className="w-full p-5 bg-slate-50 rounded-2xl font-bold" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <input type="number" placeholder="Gapok" value={empForm.gapok} onChange={e => setEmpForm({...empForm, gapok: parseInt(e.target.value) || 0})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-xs" />
                <input type="number" placeholder="Makan" value={empForm.uangMakan} onChange={e => setEmpForm({...empForm, uangMakan: parseInt(e.target.value) || 0})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-xs" />
                <input type="number" placeholder="Pot." value={empForm.deductionRate} onChange={e => setEmpForm({...empForm, deductionRate: parseInt(e.target.value) || 0})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-xs" />
              </div>
              <select value={empForm.payrollMethod} onChange={e => setEmpForm({...empForm, payrollMethod: e.target.value as PayrollMethod})} className="w-full p-5 bg-slate-50 rounded-2xl font-bold">
                <option value={PayrollMethod.DAILY_30}>Harian (Bagi 30)</option>
                <option value={PayrollMethod.FIXED_4}>Mingguan (Bagi 4)</option>
              </select>
              <div className="flex gap-4 pt-8">
                <button onClick={() => setShowEmpModal(false)} className="flex-1 py-5 bg-slate-100 rounded-2xl font-black uppercase text-[11px]">Batal</button>
                <button onClick={() => { if(editingEmp) onEditEmployee({...editingEmp, ...empForm} as User); else onAddEmployee(empForm); setShowEmpModal(false); }} className="flex-1 py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[11px] shadow-xl">Simpan</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OwnerDashboard;
