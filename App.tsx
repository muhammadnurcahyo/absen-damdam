
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, UserRole, AttendanceRecord, LeaveRequest, OutletConfig, PayrollMethod } from './types';
import { MOCK_USERS, INITIAL_OUTLET_CONFIG } from './constants';
import Layout from './components/Layout';
import EmployeeDashboard from './components/EmployeeDashboard';
import OwnerDashboard from './components/OwnerDashboard';
import { supabase } from './services/supabaseClient';

const App: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('damdam_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [outletConfig, setOutletConfig] = useState<OutletConfig>(INITIAL_OUTLET_CONFIG);
  const [payrollAdjustments, setPayrollAdjustments] = useState<Record<string, { bonus: number, deduction: number }>>({});
  
  const [activeMenu, setActiveMenu] = useState<string>(() => {
    return localStorage.getItem('damdam_active_menu') || 'dashboard';
  });
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const isTerminated = useRef(false);

  // Helper untuk mendapatkan tanggal lokal YYYY-MM-DD
  const getLocalDateString = (date: Date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Fungsi untuk membersihkan format tanggal dari Supabase (menghapus T00:00:00Z)
  const sanitizeDate = (dateStr: string) => {
    if (!dateStr) return "";
    return dateStr.split('T')[0];
  };

  const fetchData = useCallback(async (isInitial = false): Promise<User[]> => {
    if (isTerminated.current) return [];
    if (isInitial) setIsSyncing(true);

    let fetchedUsers: User[] = [];

    try {
      const { data: userData } = await supabase.from('employees').select('*');
      if (isTerminated.current) return [];
      
      if (userData && userData.length > 0) {
        fetchedUsers = userData.map((u: any) => ({
          id: u.id,
          name: u.name,
          username: u.username,
          password: u.password,
          role: u.role,
          gapok: Number(u.gapok) || 0,
          uangMakan: Number(u.uang_makan) || 0,
          deductionRate: Number(u.deduction_rate) || 0,
          payrollMethod: u.payroll_method,
          totalKasbon: Number(u.total_kasbon) || 0,
          isActive: u.is_active
        }));
      } else {
        fetchedUsers = MOCK_USERS;
      }
      setUsers(fetchedUsers);

      const { data: leaveData } = await supabase.from('leave_requests').select('*').order('date', { ascending: false });
      if (leaveData) {
        setLeaveRequests(leaveData.map((l: any) => ({
          id: l.id,
          userId: l.user_id,
          date: sanitizeDate(l.date),
          reason: l.reason,
          status: String(l.status).toUpperCase() as any,
          evidencePhoto: l.evidence_photo
        })));
      }

      const { data: attData } = await supabase.from('attendance').select('*').order('date', { ascending: false });
      if (attData) {
        setAttendance(attData.map((a: any) => ({
          id: a.id,
          userId: a.user_id,
          date: sanitizeDate(a.date),
          clockIn: a.clock_in,
          clockOut: a.clock_out,
          latitude: Number(a.latitude) || 0,
          longitude: Number(a.longitude) || 0,
          status: String(a.status).toUpperCase() as any,
          isLate: a.is_late,
          leaveRequestId: a.leave_request_id
        })));
      }

      const { data: configData } = await supabase.from('config').select('*').eq('id', 1).maybeSingle();
      if (configData) {
        setOutletConfig({
          latitude: Number(configData.latitude) || INITIAL_OUTLET_CONFIG.latitude,
          longitude: Number(configData.longitude) || INITIAL_OUTLET_CONFIG.longitude,
          radius: Number(configData.radius) || INITIAL_OUTLET_CONFIG.radius,
          clockInTime: configData.clock_in_time || INITIAL_OUTLET_CONFIG.clockInTime,
          clockOutTime: configData.clock_out_time || INITIAL_OUTLET_CONFIG.clockOutTime
        });
      }

      const { data: adjData } = await supabase.from('payroll_adjustments').select('*');
      if (adjData) {
        setPayrollAdjustments(adjData.reduce((acc: any, curr: any) => {
          acc[curr.user_id] = { bonus: Number(curr.bonus), deduction: Number(curr.deduction) };
          return acc;
        }, {}));
      }

    } catch (error) {
      console.error("Sync error:", error);
      if (users.length === 0) setUsers(MOCK_USERS);
    } finally {
      setIsSyncing(false);
    }
    return fetchedUsers;
  }, [users.length]);

  useEffect(() => { fetchData(true); }, []);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('damdam_user', JSON.stringify(currentUser));
      localStorage.setItem('damdam_active_menu', activeMenu);
    }
  }, [currentUser, activeMenu]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    let currentUsers = users.length > 0 ? users : await fetchData(true);
    const foundUser = currentUsers.find(u => u.username === loginUsername && String(u.password) === String(loginPassword));
    if (foundUser) {
      setCurrentUser(foundUser);
      setActiveMenu(foundUser.role === UserRole.OWNER ? 'dashboard' : 'home');
    } else {
      setLoginError('Username atau password salah.');
    }
  };

  const handleLogout = () => {
    isTerminated.current = true;
    localStorage.removeItem('damdam_user');
    setCurrentUser(null);
  };

  const handleUpdateKasbon = async (userId: string, amount: number) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    const newTotal = Math.max(0, user.totalKasbon + amount);
    
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, totalKasbon: newTotal } : u));
    await supabase.from('employees').update({ total_kasbon: newTotal }).eq('id', userId);
  };

  const handleAddEmployee = async (userData: Partial<User>) => {
    const newUser: User = {
      id: Math.random().toString(36).substr(2, 9),
      name: userData.name || 'Karyawan',
      username: userData.username || 'user',
      password: userData.password || '123', 
      role: UserRole.EMPLOYEE,
      gapok: userData.gapok || 0,
      uangMakan: userData.uangMakan || 0,
      deductionRate: userData.deductionRate || 0,
      payrollMethod: userData.payrollMethod || PayrollMethod.DAILY_30,
      totalKasbon: 0,
      isActive: true
    };
    setUsers(prev => [...prev, newUser]);
    await supabase.from('employees').insert([{
      id: newUser.id, name: newUser.name, username: newUser.username, password: newUser.password, 
      role: newUser.role, gapok: newUser.gapok, uang_makan: newUser.uangMakan, 
      deduction_rate: newUser.deductionRate, payroll_method: newUser.payrollMethod, total_kasbon: 0
    }]);
  };

  const handleEditEmployee = async (u: User) => {
    setUsers(prev => prev.map(item => item.id === u.id ? u : item));
    await supabase.from('employees').update({
      name: u.name, username: u.username, password: u.password, gapok: u.gapok, 
      uang_makan: u.uangMakan, deduction_rate: u.deductionRate, 
      payroll_method: u.payrollMethod, total_kasbon: u.totalKasbon
    }).eq('id', u.id);
  };

  const handleDeleteEmployee = async (userId: string) => {
    if (confirm('Hapus staf?')) {
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
      date: getLocalDateString(now), // Gunakan tanggal lokal
      clockIn: clockInTime, clockOut: null, latitude: lat, longitude: lng,
      status: 'PRESENT', isLate: isLate
    };
    setAttendance(prev => [newRecord, ...prev]);
    await supabase.from('attendance').insert([{
      id: newRecord.id, user_id: newRecord.userId, date: newRecord.date,
      clock_in: newRecord.clockIn, status: newRecord.status, is_late: newRecord.isLate,
      latitude: newRecord.latitude, longitude: newRecord.longitude
    }]);
  };

  const handleClockOut = async () => {
    if (!currentUser) return;
    const todayStr = getLocalDateString();
    const nowTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    setAttendance(prev => prev.map(a => (a.userId === currentUser.id && a.date === todayStr) ? { ...a, clockOut: nowTime } : a));
    await supabase.from('attendance').update({ clock_out: nowTime }).match({ user_id: currentUser.id, date: todayStr });
  };

  const handleSubmitLeave = async (date: string, reason: string, photo?: string) => {
    if (!currentUser) return;
    const leaveId = Math.random().toString(36).substr(2, 9);
    const newLeave: LeaveRequest = { id: leaveId, userId: currentUser.id, date, reason, status: 'PENDING', evidencePhoto: photo };
    
    // Update local states
    setLeaveRequests(prev => [newLeave, ...prev]);
    const virtualAtt: AttendanceRecord = { 
      id: `att-${leaveId}`, 
      userId: currentUser.id, 
      date, 
      clockIn: null, 
      clockOut: null, 
      latitude: 0, 
      longitude: 0, 
      status: 'LEAVE_PENDING', 
      leaveRequestId: leaveId 
    };
    setAttendance(prev => [virtualAtt, ...prev]);

    // Persist to Supabase
    await supabase.from('leave_requests').insert([{ 
      id: newLeave.id, user_id: newLeave.userId, date: newLeave.date, 
      reason: newLeave.reason, status: 'PENDING', evidence_photo: newLeave.evidencePhoto 
    }]);

    // Sisipkan record ke tabel attendance agar payroll bisa membaca data ini sejak status pending
    await supabase.from('attendance').insert([{
      id: virtualAtt.id,
      user_id: virtualAtt.userId,
      date: virtualAtt.date,
      status: 'LEAVE_PENDING',
      leave_request_id: leaveId
    }]);
  };

  const handleApproveLeave = async (leaveId: string, status: 'APPROVED' | 'REJECTED') => {
    const newStatus = status === 'APPROVED' ? 'LEAVE' : 'ABSENT';
    
    setLeaveRequests(prev => prev.map(l => l.id === leaveId ? { ...l, status } : l));
    setAttendance(prev => prev.map(a => a.leaveRequestId === leaveId ? { ...a, status: newStatus as any } : a));

    await supabase.from('leave_requests').update({ status }).eq('id', leaveId);
    await supabase.from('attendance').update({ status: newStatus }).eq('leave_request_id', leaveId);
  };

  const handleUpdateConfig = async (config: OutletConfig) => {
    setOutletConfig(config);
    await supabase.from('config').upsert([{ id: 1, latitude: config.latitude, longitude: config.longitude, radius: config.radius, clock_in_time: config.clockInTime, clock_out_time: config.clockOutTime }]);
  };

  const handleUpdateAdjustment = async (userId: string, field: 'bonus' | 'deduction', value: number) => {
    const updated = { ...(payrollAdjustments[userId] || { bonus: 0, deduction: 0 }), [field]: value };
    setPayrollAdjustments(prev => ({ ...prev, [userId]: updated }));
    await supabase.from('payroll_adjustments').upsert({ user_id: userId, bonus: updated.bonus, deduction: updated.deduction }, { onConflict: 'user_id' });
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-[40px] shadow-2xl p-10 border border-slate-100">
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl"><span className="text-4xl text-white">🧺</span></div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">DamDam Laundry</h1>
          </div>
          <form onSubmit={handleLogin} className="space-y-5">
            <input type="text" value={loginUsername} onChange={e => setLoginUsername(e.target.value)} className="w-full p-4 border border-slate-200 rounded-2xl outline-none font-bold" placeholder="Username" required />
            <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} className="w-full p-4 border border-slate-200 rounded-2xl outline-none font-bold" placeholder="Password" required />
            {loginError && <p className="text-red-500 text-[10px] font-black uppercase text-center">{loginError}</p>}
            <button type="submit" disabled={isSyncing} className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black shadow-xl uppercase tracking-widest active:scale-95 transition-all">MASUK</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <Layout user={currentUser} onLogout={handleLogout} activeMenu={activeMenu} setActiveMenu={setActiveMenu}>
      {currentUser.role === UserRole.EMPLOYEE ? (
        <EmployeeDashboard user={currentUser} outletConfig={outletConfig} attendance={attendance} leaveRequests={leaveRequests} onClockIn={handleClockIn} onClockOut={handleClockOut} onSubmitLeave={handleSubmitLeave} payrollAdjustments={payrollAdjustments[currentUser.id] || { bonus: 0, deduction: 0 }} />
      ) : (
        <OwnerDashboard 
          activeMenu={activeMenu as any} 
          employees={users} 
          attendance={attendance} 
          leaveRequests={leaveRequests} 
          outletConfig={outletConfig} 
          onApproveLeave={handleApproveLeave} 
          onUpdateConfig={handleUpdateConfig} 
          onAddEmployee={handleAddEmployee} 
          onEditEmployee={handleEditEmployee} 
          onDeleteEmployee={handleDeleteEmployee} 
          payrollAdjustments={payrollAdjustments} 
          onUpdateAdjustment={handleUpdateAdjustment}
          onUpdateKasbon={handleUpdateKasbon}
          onRefreshData={() => fetchData(false)} 
        />
      )}
    </Layout>
  );
};

export default App;
