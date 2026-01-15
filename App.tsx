
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
  const [dbError, setDbError] = useState<string | null>(null);

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setIsSyncing(true);
    setDbError(null);
    try {
      // Fetch concurrently for better performance
      const [
        { data: userData, error: uErr },
        { data: attData, error: aErr },
        { data: leaveData, error: lErr },
        { data: configData, error: cErr },
        { data: adjData, error: adErr }
      ] = await Promise.all([
        supabase.from('employees').select('*'),
        supabase.from('attendance').select('*').order('date', { ascending: false }),
        supabase.from('leave_requests').select('*'),
        supabase.from('config').select('*').maybeSingle(),
        supabase.from('payroll_adjustments').select('*')
      ]);

      if (uErr || aErr || lErr || adErr) throw new Error("Gagal mengambil data dari Cloud");

      if (userData && userData.length > 0) setUsers(userData);
      else setUsers(MOCK_USERS); // Fallback to mocks if DB empty

      if (attData) setAttendance(attData);
      if (leaveData) setLeaveRequests(leaveData);
      if (configData) setOutletConfig(configData);
      
      if (adjData) {
        const adjMap = adjData.reduce((acc: any, curr: any) => {
          acc[curr.user_id] = { bonus: curr.bonus, deduction: curr.deduction };
          return acc;
        }, {});
        setPayrollAdjustments(adjMap);
      }
    } catch (error: any) {
      console.error("Cloud Sync Error:", error);
      setDbError("Gagal terhubung ke Database Supabase. Menggunakan data lokal sementara.");
      // Fallback to local storage if available
      const savedUsers = localStorage.getItem('damdam_users');
      if (savedUsers) setUsers(JSON.parse(savedUsers));
      else setUsers(MOCK_USERS);
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
    await supabase.from('employees').insert([newUser]);
  };

  const handleEditEmployee = async (updatedUser: User) => {
    setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
    await supabase.from('employees').update(updatedUser).eq('id', updatedUser.id);
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
    
    setAttendance(prev => [...prev, newRecord]);
    await supabase.from('attendance').insert([newRecord]);
  };

  const handleClockOut = async () => {
    if (!currentUser) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const now = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    
    setAttendance(prev => prev.map(a => 
      (a.userId === currentUser.id && a.date === todayStr) ? { ...a, clockOut: now } : a
    ));
    
    await supabase.from('attendance')
      .update({ clockOut: now })
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
    await supabase.from('leave_requests').insert([newLeave]);

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
    
    setAttendance(prev => {
      const filtered = prev.filter(a => !(a.userId === currentUser.id && a.date === date));
      return [...filtered, newAttRecord];
    });
    await supabase.from('attendance').insert([newAttRecord]);
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
    await supabase.from('config').upsert([config]);
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
          
          <div className="mt-8 pt-8 border-t border-slate-100">
            <div className="flex items-center justify-center space-x-3">
              <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-500 animate-pulse' : (dbError ? 'bg-red-500' : 'bg-green-500')}`} />
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                {isSyncing ? 'Sinkronisasi Cloud...' : (dbError ? 'Mode Offline' : 'Cloud Terhubung')}
              </span>
            </div>
            {dbError && <p className="text-[8px] text-red-400 font-bold uppercase text-center mt-2 tracking-tighter">{dbError}</p>}
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
      {/* Global Sync Indicator for Logged In Users */}
      {isSyncing && (
        <div className="fixed top-4 right-4 z-[100] bg-white/80 backdrop-blur px-4 py-2 rounded-full shadow-lg border border-slate-100 flex items-center space-x-2 animate-bounce">
           <div className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse"></div>
           <span className="text-[8px] font-black uppercase text-slate-600 tracking-widest">Sinkronisasi...</span>
        </div>
      )}

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
