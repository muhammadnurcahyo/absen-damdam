
import React, { useState, useEffect } from 'react';
import { User, UserRole, AttendanceRecord, LeaveRequest, OutletConfig, PayrollMethod } from './types';
import { MOCK_USERS, INITIAL_OUTLET_CONFIG } from './constants';
import Layout from './components/Layout';
import EmployeeDashboard from './components/EmployeeDashboard';
import OwnerDashboard from './components/OwnerDashboard';

const App: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [outletConfig, setOutletConfig] = useState<OutletConfig>(INITIAL_OUTLET_CONFIG);
  const [payrollAdjustments, setPayrollAdjustments] = useState<Record<string, { bonus: number, deduction: number }>>({});

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    const savedUsers = localStorage.getItem('damdam_users');
    const savedAttendance = localStorage.getItem('damdam_attendance');
    const savedLeave = localStorage.getItem('damdam_leave');
    const savedConfig = localStorage.getItem('damdam_config');
    const savedAdjustments = localStorage.getItem('damdam_adjustments');
    
    setUsers(savedUsers ? JSON.parse(savedUsers) : MOCK_USERS);
    if (savedAttendance) setAttendance(JSON.parse(savedAttendance));
    if (savedLeave) setLeaveRequests(JSON.parse(savedLeave));
    if (savedConfig) setOutletConfig(JSON.parse(savedConfig));
    if (savedAdjustments) setPayrollAdjustments(JSON.parse(savedAdjustments));
  }, []);

  useEffect(() => {
    if (users.length > 0) localStorage.setItem('damdam_users', JSON.stringify(users));
    localStorage.setItem('damdam_attendance', JSON.stringify(attendance));
    localStorage.setItem('damdam_leave', JSON.stringify(leaveRequests));
    localStorage.setItem('damdam_config', JSON.stringify(outletConfig));
    localStorage.setItem('damdam_adjustments', JSON.stringify(payrollAdjustments));
  }, [users, attendance, leaveRequests, outletConfig, payrollAdjustments]);

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

  const handleAddEmployee = (userData: Partial<User>) => {
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
  };

  const handleEditEmployee = (updatedUser: User) => {
    setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
  };

  const handleDeleteEmployee = (userId: string) => {
    if (confirm('Hapus karyawan ini?')) {
      setUsers(prev => prev.filter(u => u.id !== userId));
    }
  };

  const handleClockIn = (lat: number, lng: number) => {
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
  };

  const handleClockOut = () => {
    if (!currentUser) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const now = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    setAttendance(prev => prev.map(a => 
      (a.userId === currentUser.id && a.date === todayStr) ? { ...a, clockOut: now } : a
    ));
  };

  const handleSubmitLeave = (date: string, reason: string, photo?: string) => {
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
  };

  const handleApproveLeave = (leaveId: string, status: 'APPROVED' | 'REJECTED') => {
    setLeaveRequests(prev => prev.map(l => l.id === leaveId ? { ...l, status } : l));
    
    setAttendance(prev => prev.map(a => {
      if (a.leaveRequestId === leaveId) {
        return { 
          ...a, 
          status: status === 'APPROVED' ? 'LEAVE' : 'ABSENT' 
        };
      }
      return a;
    }));
  };

  const handleUpdateConfig = (config: OutletConfig) => {
    setOutletConfig(config);
  };

  const handleUpdateAdjustment = (userId: string, field: 'bonus' | 'deduction', value: number) => {
    setPayrollAdjustments(prev => ({
      ...prev,
      [userId]: {
        ...(prev[userId] || { bonus: 0, deduction: 0 }),
        [field]: value
      }
    }));
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-[40px] shadow-2xl p-12 border border-slate-100">
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl">
              <span className="text-4xl text-white">🧺</span>
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">DamDam Laundry</h1>
          </div>
          <form onSubmit={handleLogin} className="space-y-5">
            <input type="text" value={loginUsername} onChange={e => setLoginUsername(e.target.value)} className="w-full p-4 border border-slate-200 rounded-2xl outline-none font-bold" placeholder="Username" required />
            <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} className="w-full p-4 border border-slate-200 rounded-2xl outline-none font-bold" placeholder="Password" required />
            {loginError && <p className="text-red-500 text-[10px] font-black uppercase text-center">{loginError}</p>}
            <button type="submit" className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black shadow-xl uppercase tracking-widest">Login</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <Layout user={currentUser} onLogout={handleLogout}>
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
