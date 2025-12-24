
import React, { useState, useMemo, useEffect } from 'react';
import { User, AttendanceRecord, LeaveRequest, OutletConfig, UserRole, PayrollReport } from '../types';
import { calculateWeeklyPayroll } from '../services/payrollService';
import { FREE_LEAVE_QUOTA, DAYS_IN_MONTH } from '../constants';

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
  onDeleteEmployee
}) => {
  const [activeMenu, setActiveMenu] = useState<'dashboard' | 'employees' | 'attendance' | 'payroll' | 'settings'>('dashboard');
  
  // Attendance Filter States
  const [attStartDate, setAttStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [attEndDate, setAttEndDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Payroll Filter States
  const [payStartDate, setPayStartDate] = useState('');
  const [payEndDate, setPayEndDate] = useState('');

  // Payroll adjustments state (persistent during session)
  const [adjustments, setAdjustments] = useState<Record<string, { bonus: number, deduction: number }>>({});

  const [showEmpModal, setShowEmpModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<User | null>(null);
  const [empForm, setEmpForm] = useState<Partial<User>>({ name: '', username: '', password: '', gapok: 0, uangMakan: 0 });

  const [tempConfig, setTempConfig] = useState(outletConfig);

  // Initialize Payroll Dates to last Thursday cycle
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

  const getRemainingLeave = (userId: string) => {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const approvedLeaves = leaveRequests.filter(l => 
      l.userId === userId && 
      l.status === 'APPROVED' && 
      new Date(l.date).getMonth() === currentMonth &&
      new Date(l.date).getFullYear() === currentYear
    ).length;
    return Math.max(0, FREE_LEAVE_QUOTA - approvedLeaves);
  };

  const handleAdjustmentChange = (userId: string, field: 'bonus' | 'deduction', value: string) => {
    const numValue = parseInt(value) || 0;
    setAdjustments(prev => ({
      ...prev,
      [userId]: {
        ...(prev[userId] || { bonus: 0, deduction: 0 }),
        [field]: numValue
      }
    }));
  };

  const exportAttendanceToPDF = () => {
    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Laporan Kehadiran DamDam Laundry", 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Periode: ${attStartDate} s/d ${attEndDate}`, 14, 28);
    
    const mergedData = getMergedAttendance();
    const tableData = mergedData.map(item => [
      employees.find(e => e.id === item.userId)?.name || 'Unknown',
      item.date || '-',
      item.type === 'ATTENDANCE' ? (item.clockIn || '-') : '-',
      item.type === 'ATTENDANCE' ? (item.clockOut || '-') : '-',
      item.statusText
    ]);
    
    (doc as any).autoTable({
      startY: 35,
      head: [['Nama Karyawan', 'Tanggal', 'Jam Masuk', 'Jam Keluar', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
    });
    doc.save(`absensi_damdam_${attStartDate}_to_${attEndDate}.pdf`);
  };

  const exportIndividualSlipPDF = (emp: User) => {
    const { jsPDF } = (window as any).jspdf;
    const report = getPayrollForUser(emp);
    const doc = new jsPDF();
    
    doc.setFontSize(22);
    doc.setTextColor(79, 70, 229);
    doc.text("DamDam Laundry", 105, 20, { align: 'center' });
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text("SLIP GAJI MINGGUAN", 105, 28, { align: 'center' });
    doc.line(14, 35, 196, 35);
    
    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.text(`Nama: ${emp.name}`, 14, 45);
    doc.text(`Periode: ${payStartDate} s/d ${payEndDate}`, 14, 51);
    doc.text(`Potongan Per Hari: Rp ${Math.round(report.dailyRate).toLocaleString('id-ID')}`, 14, 57);
    
    const attDeduction = report.excessLeaveCount * report.dailyRate;
    const deductionLabel = emp.uangMakan > 0 ? 'Potongan Uang Makan' : 'Potongan Gaji Pokok';

    (doc as any).autoTable({
      startY: 65,
      head: [['DESKRIPSI', 'KETERANGAN', 'JUMLAH']],
      body: [
        ['Gaji Kotor (Gapok + Makan)', 'Mingguan (7 Hari)', `Rp ${report.grossSalary.toLocaleString('id-ID')}`],
        ['Bonus Mingguan', 'Tambahan Owner', `Rp ${report.bonus.toLocaleString('id-ID')}`],
        [deductionLabel, `${report.excessLeaveCount} Hari (>3x)`, `Rp ${attDeduction.toLocaleString('id-ID')}`],
        ['Potongan Lainnya', 'Manual', `Rp ${report.manualDeduction.toLocaleString('id-ID')}`],
      ],
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
    });
    
    const finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text("TOTAL TAKE HOME PAY", 14, finalY);
    doc.text(`Rp ${report.netSalary.toLocaleString('id-ID')}`, 196, finalY, { align: 'right' });
    
    doc.save(`slip_${emp.username}.pdf`);
  };

  const getMergedAttendance = () => {
    const start = new Date(attStartDate);
    const end = new Date(attEndDate);
    
    const dailyAtt = attendance.filter(a => {
      const d = new Date(a.date);
      return d >= start && d <= end;
    });
    
    const dailyLeaves = leaveRequests.filter(l => {
      const d = new Date(l.date);
      return d >= start && d <= end;
    });

    const combined: any[] = [];
    
    dailyAtt.forEach(a => {
      let statusText = a.status === 'PRESENT' ? 'HADIR' : 'ABSEN';
      if (a.status === 'PRESENT' && a.isLate) statusText = 'TERLAMBAT';
      combined.push({ ...a, type: 'ATTENDANCE', statusText });
    });

    dailyLeaves.forEach(l => {
      const alreadyIn = combined.find(c => c.userId === l.userId && c.date === l.date);
      if (!alreadyIn) {
        let statusText = 'IZIN (PENDING)';
        if (l.status === 'APPROVED') statusText = 'IZIN (DISETUJUI)';
        if (l.status === 'REJECTED') statusText = 'IZIN (DITOLAK)';
        combined.push({ userId: l.userId, date: l.date, type: 'LEAVE', statusText: statusText });
      }
    });

    return combined.sort((a, b) => b.date.localeCompare(a.date));
  };

  const getPayrollForUser = (user: User) => {
    const start = new Date(payStartDate);
    const end = new Date(payEndDate);
    const monthStart = new Date(end.getFullYear(), end.getMonth(), 1);
    const monthRecords = attendance.filter(a => a.userId === user.id && new Date(a.date) >= monthStart);
    const adj = adjustments[user.id] || { bonus: 0, deduction: 0 };
    return calculateWeeklyPayroll(user, attendance.filter(a => a.userId === user.id), monthRecords, start, end, adj.bonus, adj.deduction);
  };

  const SidebarItem = ({ icon, label, id }: { icon: string, label: string, id: typeof activeMenu }) => (
    <button
      onClick={() => setActiveMenu(id)}
      className={`w-full flex items-center space-x-3 px-4 py-4 rounded-2xl transition-all ${
        activeMenu === id ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100' : 'text-slate-500 hover:bg-slate-50'
      }`}
    >
      <span className="text-xl">{icon}</span>
      <span className="font-bold text-sm tracking-tight">{label}</span>
    </button>
  );

  return (
    <div className="flex flex-col md:flex-row gap-8">
      <aside className="w-full md:w-64 space-y-2">
        <SidebarItem icon="📊" label="Dashboard" id="dashboard" />
        <SidebarItem icon="👥" label="Karyawan" id="employees" />
        <SidebarItem icon="📅" label="Absensi" id="attendance" />
        <SidebarItem icon="💰" label="Payroll" id="payroll" />
        <SidebarItem icon="⚙️" label="Pengaturan" id="settings" />
      </aside>

      <div className="flex-1 bg-white rounded-[40px] border border-slate-100 shadow-sm p-10 min-h-[600px]">
        {activeMenu === 'dashboard' && (
          <div className="space-y-10">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Ikhtisar Bisnis</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="bg-white border border-slate-100 p-8 rounded-3xl shadow-sm">
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2">Total Staf</p>
                <p className="text-4xl font-black text-slate-900">{employees.filter(e => e.role === UserRole.EMPLOYEE).length}</p>
              </div>
              <div className="bg-white border border-slate-100 p-8 rounded-3xl shadow-sm">
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2">Hadir (Hari Ini)</p>
                <p className="text-4xl font-black text-indigo-600">
                  {attendance.filter(a => a.date === new Date().toISOString().split('T')[0] && a.status === 'PRESENT').length}
                </p>
              </div>
              <div className="bg-white border border-slate-100 p-8 rounded-3xl shadow-sm">
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2">Izin Pending</p>
                <p className="text-4xl font-black text-purple-600">{leaveRequests.filter(l => l.status === 'PENDING').length}</p>
              </div>
            </div>
            <section>
              <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center">
                <span className="w-2 h-6 bg-purple-500 rounded-full mr-3"></span>
                Persetujuan Izin
              </h3>
              <div className="space-y-4">
                {leaveRequests.filter(l => l.status === 'PENDING').map(l => {
                    const sisaLibur = getRemainingLeave(l.userId);
                    return (
                      <div key={l.id} className="flex flex-col md:flex-row md:items-center justify-between p-6 bg-white rounded-3xl border border-slate-100 shadow-sm gap-6">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-1">
                            <p className="font-black text-slate-900 text-lg">{employees.find(e => e.id === l.userId)?.name}</p>
                            <span className={`text-[10px] px-3 py-1 rounded-full font-black ${sisaLibur > 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                                Sisa Jatah: {sisaLibur}x
                            </span>
                          </div>
                          <p className="text-sm text-slate-500 font-medium"><span className="text-indigo-600 font-bold">{l.date}</span> — "{l.reason}"</p>
                        </div>
                        <div className="flex space-x-3">
                          <button onClick={() => onApproveLeave(l.id, 'APPROVED')} className="flex-1 md:flex-none bg-green-500 text-white px-8 py-3 rounded-2xl text-xs font-black hover:bg-green-600 shadow-lg shadow-green-50 transition-all">SETUJUI</button>
                          <button onClick={() => onApproveLeave(l.id, 'REJECTED')} className="flex-1 md:flex-none bg-white text-red-500 border border-red-100 px-8 py-3 rounded-2xl text-xs font-black hover:bg-red-50 transition-all">TOLAK</button>
                        </div>
                      </div>
                    );
                })}
              </div>
            </section>
          </div>
        )}

        {activeMenu === 'employees' && (
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">Manajemen Staf</h2>
              <button 
                onClick={() => { setEditingEmp(null); setEmpForm({ name: '', username: '', password: '', gapok: 0, uangMakan: 0 }); setShowEmpModal(true); }}
                className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all"
              >
                + Tambah Staf
              </button>
            </div>
            <div className="overflow-x-auto border border-slate-50 rounded-[32px] shadow-sm">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                  <tr>
                    <th className="px-8 py-6">Nama</th>
                    <th className="px-8 py-6">Username</th>
                    <th className="px-8 py-6">Gaji Pokok</th>
                    <th className="px-8 py-6">Uang Makan</th>
                    <th className="px-8 py-6 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-sm">
                  {employees.filter(e => e.role === UserRole.EMPLOYEE).map(e => (
                    <tr key={e.id} className="hover:bg-slate-50/30 transition-colors">
                      <td className="px-8 py-6 font-black text-slate-800">{e.name}</td>
                      <td className="px-8 py-6 text-slate-500 font-bold">@{e.username}</td>
                      <td className="px-8 py-6 text-slate-600 font-bold italic">Rp {e.gapok.toLocaleString('id-ID')}</td>
                      <td className="px-8 py-6 text-slate-600 font-bold italic">Rp {e.uangMakan.toLocaleString('id-ID')}</td>
                      <td className="px-8 py-6 text-right space-x-4">
                        <button onClick={() => { setEditingEmp(e); setEmpForm(e); setShowEmpModal(true); }} className="text-indigo-600 font-black text-xs">Edit</button>
                        <button onClick={() => onDeleteEmployee(e.id)} className="text-red-500 font-black text-xs">Hapus</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeMenu === 'attendance' && (
          <div className="space-y-8">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 bg-slate-50 p-8 rounded-[32px] border border-slate-100">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Dari Tanggal</label>
                  <input type="date" value={attStartDate} onChange={(e) => setAttStartDate(e.target.value)} className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none font-black text-slate-700 shadow-sm" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Sampai Tanggal</label>
                  <input type="date" value={attEndDate} onChange={(e) => setAttEndDate(e.target.value)} className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none font-black text-slate-700 shadow-sm" />
                </div>
              </div>
              <button onClick={exportAttendanceToPDF} className="bg-indigo-600 text-white px-10 py-4 rounded-2xl font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center h-[58px]">
                <span className="mr-2 text-lg">📄</span> EXPORT PDF
              </button>
            </div>
            
            <div className="overflow-x-auto border border-slate-50 rounded-[32px] shadow-sm">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                  <tr>
                    <th className="px-8 py-6">Staf</th>
                    <th className="px-8 py-6">Tanggal</th>
                    <th className="px-8 py-6">Jam Masuk</th>
                    <th className="px-8 py-6">Jam Keluar</th>
                    <th className="px-8 py-6">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-sm">
                  {getMergedAttendance().map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/30 transition-colors">
                      <td className="px-8 py-6 font-black text-slate-800">{employees.find(e => e.id === item.userId)?.name}</td>
                      <td className="px-8 py-6 text-slate-500 font-bold">{item.date}</td>
                      <td className="px-8 py-6 text-slate-500 font-bold">{item.clockIn || '--'}</td>
                      <td className="px-8 py-6 text-slate-500 font-bold">{item.clockOut || '--'}</td>
                      <td className="px-8 py-6"><span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${item.statusText === 'HADIR' ? 'bg-green-100 text-green-700' : item.statusText === 'TERLAMBAT' ? 'bg-yellow-100 text-yellow-700' : item.statusText.includes('IZIN') ? 'bg-purple-100 text-purple-700' : 'bg-red-100 text-red-700'}`}>{item.statusText}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeMenu === 'payroll' && (
          <div className="space-y-8">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 bg-slate-50 p-8 rounded-[40px] border border-slate-100">
               <div className="flex-1">
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-4">Atur Periode Gaji</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Awal Periode</label>
                      <input type="date" value={payStartDate} onChange={(e) => setPayStartDate(e.target.value)} className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none font-black text-slate-700 shadow-sm" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Akhir Periode</label>
                      <input type="date" value={payEndDate} onChange={(e) => setPayEndDate(e.target.value)} className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none font-black text-slate-700 shadow-sm" />
                    </div>
                  </div>
               </div>
            </div>

            <div className="space-y-6">
              {employees.filter(e => e.role === UserRole.EMPLOYEE).map(emp => {
                const report = getPayrollForUser(emp);
                const adj = adjustments[emp.id] || { bonus: 0, deduction: 0 };
                return (
                  <div key={emp.id} className="p-8 bg-white border border-slate-100 rounded-[32px] hover:shadow-xl transition-all border-l-4 border-l-indigo-600 flex flex-col gap-8">
                    <div className="flex flex-col md:flex-row justify-between gap-6">
                      <div>
                        <h4 className="text-xl font-black text-slate-900 mb-2">{emp.name}</h4>
                        <div className="flex flex-wrap gap-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                           <span className="bg-slate-50 px-3 py-1 rounded-full">Hadir: <span className="text-indigo-600">{report.totalPresent}</span></span>
                           <span className="bg-slate-50 px-3 py-1 rounded-full">Izin: <span className="text-purple-600">{report.totalLeave}</span></span>
                           <span className="bg-red-50 text-red-600 px-3 py-1 rounded-full">Potong Kuota: {report.excessLeaveCount} Hari</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-10">
                        <div className="text-right">
                          <p className="text-[10px] text-slate-400 font-black uppercase mb-1">Take Home Pay</p>
                          <p className="text-3xl font-black text-indigo-700">Rp {report.netSalary.toLocaleString('id-ID')}</p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-slate-50">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Input Bonus</label>
                          <input type="number" value={adj.bonus} onChange={(e) => handleAdjustmentChange(emp.id, 'bonus', e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-green-700" placeholder="Rp 0"/>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Potongan Manual</label>
                          <input type="number" value={adj.deduction} onChange={(e) => handleAdjustmentChange(emp.id, 'deduction', e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-red-700" placeholder="Rp 0"/>
                        </div>
                    </div>
                    <button onClick={() => exportIndividualSlipPDF(emp)} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all">Download Slip Gaji Karyawan</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeMenu === 'settings' && (
          <div className="max-w-2xl space-y-10">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Konfigurasi Operasional</h2>
            <div className="space-y-8 bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm">
              <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Jam Masuk (Start)</label>
                    <input type="time" value={tempConfig.clockInTime} onChange={e => setTempConfig({...tempConfig, clockInTime: e.target.value})} className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl font-bold text-slate-800"/>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Jam Pulang (Finish)</label>
                    <input type="time" value={tempConfig.clockOutTime} onChange={e => setTempConfig({...tempConfig, clockOutTime: e.target.value})} className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl font-bold text-slate-800"/>
                  </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Latitude</label>
                    <input type="number" value={tempConfig.latitude} onChange={e => setTempConfig({...tempConfig, latitude: parseFloat(e.target.value)})} className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl font-bold text-slate-800"/>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Longitude</label>
                    <input type="number" value={tempConfig.longitude} onChange={e => setTempConfig({...tempConfig, longitude: parseFloat(e.target.value)})} className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl font-bold text-slate-800"/>
                  </div>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Radius Keamanan (Meter)</label>
                <input type="number" value={tempConfig.radius} onChange={e => setTempConfig({...tempConfig, radius: parseInt(e.target.value)})} className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl font-bold text-slate-800"/>
              </div>
              <button onClick={() => onUpdateConfig(tempConfig)} className="w-full bg-slate-900 text-white py-5 rounded-3xl font-black hover:bg-black transition-all shadow-xl shadow-slate-100 active:scale-95">SIMPAN PENGATURAN</button>
            </div>
          </div>
        )}
      </div>

      {showEmpModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] w-full max-w-lg p-10 shadow-2xl border border-slate-100">
            <div className="mb-10 text-center">
                <h3 className="text-2xl font-black text-slate-900">{editingEmp ? 'Ubah Profil Karyawan' : 'Daftarkan Karyawan'}</h3>
            </div>
            <div className="space-y-6">
              <div className="space-y-2">
                 <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Nama Lengkap</label>
                 <input placeholder="E.g. Siti Aminah" value={empForm.name} onChange={e => setEmpForm({...empForm, name: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold"/>
              </div>
              <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Username</label>
                    <input placeholder="username" value={empForm.username} onChange={e => setEmpForm({...empForm, username: e.target.value.toLowerCase().replace(/\s/g, '')})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold"/>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Password</label>
                    <input type="text" placeholder="Min. 6 Karakter" value={empForm.password} onChange={e => setEmpForm({...empForm, password: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold"/>
                  </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Gaji Pokok / Bulan</label>
                  <input type="number" value={empForm.gapok} onChange={e => setEmpForm({...empForm, gapok: parseInt(e.target.value)})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-black text-indigo-600"/>
                </div>
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Uang Makan / Bulan</label>
                  <input type="number" value={empForm.uangMakan} onChange={e => setEmpForm({...empForm, uangMakan: parseInt(e.target.value)})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-black text-green-600"/>
                </div>
              </div>
              <div className="flex space-x-4 pt-8">
                <button onClick={() => setShowEmpModal(false)} className="flex-1 bg-white border border-slate-200 py-4 rounded-2xl font-black text-slate-400">BATAL</button>
                <button onClick={() => { if (editingEmp) onEditEmployee({ ...editingEmp, ...empForm } as User); else onAddEmployee(empForm); setShowEmpModal(false); }} className="flex-1 bg-indigo-600 py-4 rounded-2xl font-black text-white shadow-xl shadow-indigo-100 transition-all">SIMPAN DATA</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OwnerDashboard;
