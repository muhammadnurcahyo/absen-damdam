
import React, { useState, useEffect } from 'react';
import { User, UserRole, AttendanceRecord, LeaveRequest, OutletConfig, PayrollMethod } from './types';
import { MOCK_USERS, INITIAL_OUTLET_CONFIG } from './constants';
import Layout from './components/Layout';
import EmployeeDashboard from './components/EmployeeDashboard';
import OwnerDashboard from './components/OwnerDashboard';
import { supabase } from './services/supabaseClient';

const App: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [outletConfig, setOutletConfig] = useState<OutletConfig>(INITIAL_OUTLET_CONFIG);
  const [payrollAdjustments, setPayrollAdjustments] = useState<Record<string, { bonus: number, deduction: number }>>({});
  
  const [activeMenu, setActiveMenu] = useState<string>('dashboard');
  const [isSyncing, setIsSyncing] = useState(false);

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setIsSyncing(true);
    try {
      const { data: userData } = await supabase.from('employees').select('*');
      
      if (userData && userData.length > 0) {
        // Map snake_case from DB to camelCase in TS
        const mappedUsers = userData.map((u: any) => ({
          id: u.id,
          name: u.name,
          username: u.username,
          password: u.password,
          role: u.role,
          gapok: u.gapok,
          uangMakan: u.uang_makan,
          deductionRate: u.deduction_rate,
          payrollMethod: u.payroll_method,
          isActive: u.is_active
        }));
        setUsers(mappedUsers);
      } else {
        setUsers(MOCK_USERS);
      }

      const { data: attData } = await supabase.from('attendance').select('*').order('date', { ascending: false });
      if (attData) {
        setAttendance(attData.map((a: any) => ({
          ...a,
          userId: a.user_id,
          clockIn: a.clock_in,
          clockOut: a.clock_out,
          leaveRequestId: a.leave_request_id
        })));
      }

      const { data: configData } = await supabase.from('config').select('*').maybeSingle();
      if (configData) setOutletConfig({
        latitude: configData.latitude,
        longitude: configData.longitude,
        radius: configData.radius,
        clockInTime: configData.clock_in_time,
        clockOutTime: configData.clock_out_time
      });

      const { data: adjData } = await supabase.from('payroll_adjustments').select('*');
      if (adjData) {
        const adjMap = adjData.reduce((acc: any, curr: any) => {
          acc[curr.user_id] = { bonus: curr.bonus, deduction: curr.deduction };
          return acc;
        }, {});
        setPayrollAdjustments(adjMap);
      }
    } catch (error) {
      console.error("Cloud Sync Error:", error);
      setUsers(MOCK_USERS);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const user = users.find(u => u.username === loginUsername && u.password === loginPassword);
    if (user) {
      setCurrentUser(user);
    } else {
      setLoginError('Username atau password salah.');
    }
  };

  const handleLogout = () => setCurrentUser(null);

  const handleAddEmployee = async (userData: Partial<User>) => {
    const newUser: User = {
      id: Math.random().toString(36).substr(2, 9),
      name: userData.name || 'Karyawan Baru',
      username: userData.username || 'emp' + Math.floor(Math.random() * 100),
      password: userData.password || '123456', 
      role: UserRole.EMPLOYEE,
      gapok: userData.gapok || 0,
      uangMakan: userData.uangMakan || 0,
      deductionRate: userData.deductionRate || 0,
      payrollMethod: userData.payrollMethod || PayrollMethod.DAILY_30,
      isActive: true
    };
    
    setUsers(prev => [...prev, newUser]);
    await supabase.from('employees').insert([{
      id: newUser.id,
      name: newUser.name,
      username: newUser.username,
      password: newUser.password,
      role: newUser.role,
      gapok: newUser.gapok,
      uang_makan: newUser.uangMakan,
      deduction_rate: newUser.deductionRate,
      payroll_method: newUser.payrollMethod,
      is_active: newUser.isActive
    }]);
  };

  const handleEditEmployee = async (u: User) => {
    setUsers(prev => prev.map(item => item.id === u.id ? u : item));
    await supabase.from('employees').update({
      name: u.name,
      username: u.username,
      password: u.password,
      role: u.role,
      gapok: u.gapok,
      uang_makan: u.uangMakan,
      deduction_rate: u.deductionRate,
      payroll_method: u.payrollMethod,
      is_active: u.isActive
    }).eq('id', u.id);
  };

  const handleDeleteEmployee = async (userId: string) => {
    if (confirm('Hapus karyawan ini?')) {
      setUsers(prev => prev.filter(u => u.id !== userId));
      await supabase.from('employees').delete().eq('id', userId);
    }
  };

  const handleClockIn = async (lat: number, lng: number) => {
    if (!currentUser) return;
    const now = new Date();
    const clockInTime = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    const [nowH, nowM] = clockInTime.split(':').map(Number);
    const [targetH, targetM] = outletConfig.clockInTime.split(':').map(Number);
    const isLate = (nowH > targetH) || (nowH === targetH && nowM > targetM);

    const newRecord: AttendanceRecord = {
      id: Math.random().toString(36).substr(2, 9),
      userId: currentUser.id,
      date: now.toISOString().split('T')[0],
      clockIn: clockInTime,
      clockOut: null,
      latitude: lat,
      longitude: lng,
      status: 'PRESENT',
      isLate: isLate
    };
    
    setAttendance(prev => [newRecord, ...prev]);
    await supabase.from('attendance').insert([{
      id: newRecord.id,
      user_id: newRecord.userId,
      date: newRecord.date,
      clock_in: newRecord.clockIn,
      status: newRecord.status,
      is_late: newRecord.isLate,
      latitude: newRecord.latitude,
      longitude: newRecord.longitude
    }]);
  };

  const handleClockOut = async () => {
    if (!currentUser) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    
    setAttendance(prev => prev.map(a => 
      (a.userId === currentUser.id && a.date === todayStr) ? { ...a, clockOut: nowTime } : a
    ));
    
    await supabase.from('attendance')
      .update({ clock_out: nowTime })
      .match({ user_id: currentUser.id, date: todayStr });
  };

  const handleSubmitLeave = async (date: string, reason: string, photo?: string) => {
    if (!currentUser) return;
    const leaveId = Math.random().toString(36).substr(2, 9);
    const newLeave: LeaveRequest = {
      id: leaveId,
      userId: currentUser.id,
      date,
      reason,
      status: 'PENDING',
      evidencePhoto: photo
    };
    
    setLeaveRequests(prev => [...prev, newLeave]);
    await supabase.from('leave_requests').insert([{
      id: newLeave.id,
      user_id: newLeave.userId,
      date: newLeave.date,
      reason: newLeave.reason,
      status: newLeave.status,
      evidence_photo: newLeave.evidencePhoto
    }]);

    const newAttRecord: AttendanceRecord = {
      id: Math.random().toString(36).substr(2, 9),
      userId: currentUser.id,
      date,
      clockIn: null,
      clockOut: null,
      latitude: 0,
      longitude: 0,
      status: 'LEAVE_PENDING',
      leaveRequestId: leaveId
    };
    
    setAttendance(prev => [newAttRecord, ...prev]);
    await supabase.from('attendance').insert([{
      id: newAttRecord.id,
      user_id: newAttRecord.userId,
      date: newAttRecord.date,
      status: newAttRecord.status,
      leave_request_id: newAttRecord.leaveRequestId
    }]);
  };

  const handleApproveLeave = async (leaveId: string, status: 'APPROVED' | 'REJECTED') => {
    setLeaveRequests(prev => prev.map(l => l.id === leaveId ? { ...l, status } : l));
    await supabase.from('leave_requests').update({ status }).eq('id', leaveId);
    
    const newStatus = status === 'APPROVED' ? 'LEAVE' : 'ABSENT';
    setAttendance(prev => prev.map(a => 
      a.leaveRequestId === leaveId ? { ...a, status: newStatus } : a
    ));
    await supabase.from('attendance').update({ status: newStatus }).eq('leave_request_id', leaveId);
  };

  const handleUpdateConfig = async (config: OutletConfig) => {
    setOutletConfig(config);
    await supabase.from('config').upsert([{
      id: 1, // Kita pakai satu baris saja untuk config
      latitude: config.latitude,
      longitude: config.longitude,
      radius: config.radius,
      clock_in_time: config.clockInTime,
      clock_out_time: config.clockOutTime
    }]);
  };

  const handleUpdateAdjustment = async (userId: string, field: 'bonus' | 'deduction', value: number) => {
    const updated = {
      ...(payrollAdjustments[userId] || { bonus: 0, deduction: 0 }),
      [field]: value
    };
    
    setPayrollAdjustments(prev => ({
      ...prev,
      [userId]: updated
    }));

    await supabase.from('payroll_adjustments').upsert({
      user_id: userId,
      bonus: updated.bonus,
      deduction: updated.deduction
    }, { onConflict: 'user_id' });
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-[40px] shadow-2xl p-10 md:p-12 border border-slate-100">
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-indigo-100">
              <span className="text-4xl text-white">🧺</span>
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">DamDam Laundry</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Payroll Cloud System</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-5">
            <input type="text" value={loginUsername} onChange={e => setLoginUsername(e.target.value)} className="w-full p-4 border border-slate-200 rounded-2xl outline-none font-bold focus:border-indigo-600 transition-colors" placeholder="Username" required />
            <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} className="w-full p-4 border border-slate-200 rounded-2xl outline-none font-bold focus:border-indigo-600 transition-colors" placeholder="Password" required />
            {loginError && <p className="text-red-500 text-[10px] font-black uppercase text-center">{loginError}</p>}
            <button type="submit" className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black shadow-xl shadow-indigo-100 uppercase tracking-widest active:scale-95 transition-all">Login Sistem</button>
          </form>
          <div className="mt-8 flex items-center justify-center space-x-2">
             <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`} />
             <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{isSyncing ? 'Sinkronisasi...' : 'Cloud Aktif'}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Layout 
      user={currentUser} 
      onLogout={handleLogout} 
      activeMenu={activeMenu} 
      setActiveMenu={setActiveMenu}
    >
      {currentUser.role === UserRole.EMPLOYEE ? (
        <EmployeeDashboard 
          user={currentUser} 
          outletConfig={outletConfig} 
          attendance={attendance} 
          leaveRequests={leaveRequests} 
          onClockIn={handleClockIn} 
          onClockOut={handleClockOut} 
          onSubmitLeave={handleSubmitLeave}
          payrollAdjustments={payrollAdjustments[currentUser.id] || { bonus: 0, deduction: 0 }}
        />
      ) : (
        <OwnerDashboard 
          activeMenu={activeMenu as any}
          employees={users} 
          attendance={attendance} 
          leaveRequests={leaveRequests} 
          outletConfig={outletConfig} 
          onUpdateConfig={handleUpdateConfig} 
          onApproveLeave={handleApproveLeave} 
          onAddEmployee={handleAddEmployee} 
          onEditEmployee={handleEditEmployee} 
          onDeleteEmployee={handleDeleteEmployee}
          payrollAdjustments={payrollAdjustments}
          onUpdateAdjustment={handleUpdateAdjustment}
        />
      )}
    </Layout>
  );
};

export default App;
