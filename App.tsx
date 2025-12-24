
import React, { useState, useEffect } from 'react';
import { User, UserRole, AttendanceRecord, LeaveRequest, OutletConfig } from './types';
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

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    const savedUsers = localStorage.getItem('damdam_users');
    const savedAttendance = localStorage.getItem('damdam_attendance');
    const savedLeave = localStorage.getItem('damdam_leave');
    const savedConfig = localStorage.getItem('damdam_config');
    
    setUsers(savedUsers ? JSON.parse(savedUsers) : MOCK_USERS);
    if (savedAttendance) setAttendance(JSON.parse(savedAttendance));
    if (savedLeave) setLeaveRequests(JSON.parse(savedLeave));
    if (savedConfig) setOutletConfig(JSON.parse(savedConfig));
  }, []);

  useEffect(() => {
    if (users.length > 0) localStorage.setItem('damdam_users', JSON.stringify(users));
    localStorage.setItem('damdam_attendance', JSON.stringify(attendance));
    localStorage.setItem('damdam_leave', JSON.stringify(leaveRequests));
    localStorage.setItem('damdam_config', JSON.stringify(outletConfig));
  }, [users, attendance, leaveRequests, outletConfig]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const user = users.find(u => u.username === loginUsername && u.password === loginPassword);
    if (user) {
      setCurrentUser(user);
      setLoginUsername('');
      setLoginPassword('');
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
      isActive: true
    };
    setUsers(prev => [...prev, newUser]);
  };

  const handleEditEmployee = (updatedUser: User) => {
    setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
  };

  const handleDeleteEmployee = (userId: string) => {
    if (confirm('Hapus karyawan ini? Data absensi akan tetap ada.')) {
      setUsers(prev => prev.filter(u => u.id !== userId));
    }
  };

  const handleClockIn = (lat: number, lng: number) => {
    if (!currentUser) return;
    const now = new Date();
    const clockInTime = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    
    // Check for lateness
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
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    setAttendance(prev => prev.map(a => 
      (a.userId === currentUser.id && a.date === today) ? { ...a, clockOut: now } : a
    ));
  };

  const handleSubmitLeave = (date: string, reason: string) => {
    if (!currentUser) return;
    const newLeave: LeaveRequest = {
      id: Math.random().toString(36).substr(2, 9),
      userId: currentUser.id,
      date,
      reason,
      status: 'PENDING'
    };
    setLeaveRequests(prev => [...prev, newLeave]);
  };

  const handleApproveLeave = (leaveId: string, status: 'APPROVED' | 'REJECTED') => {
    setLeaveRequests(prev => prev.map(l => l.id === leaveId ? { ...l, status } : l));
    if (status === 'APPROVED') {
      const leave = leaveRequests.find(l => l.id === leaveId);
      if (leave) {
        setAttendance(prev => {
          const filtered = prev.filter(a => !(a.userId === leave.userId && a.date === leave.date));
          const leaveRecord: AttendanceRecord = {
            id: Math.random().toString(36).substr(2, 9),
            userId: leave.userId,
            date: leave.date,
            clockIn: null,
            clockOut: null,
            latitude: 0,
            longitude: 0,
            status: 'LEAVE'
          };
          return [...filtered, leaveRecord];
        });
      }
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-[40px] shadow-2xl p-12 border border-slate-100">
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl rotate-3">
              <span className="text-4xl text-white">🧺</span>
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">DamDam Laundry</h1>
            <p className="text-slate-400 font-bold uppercase tracking-tighter text-[10px] mt-1">Management System</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Username</label>
              <input 
                type="text" 
                value={loginUsername}
                onChange={e => setLoginUsername(e.target.value)}
                className="w-full p-4 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-700 transition-all" 
                placeholder="masukkan username"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Password</label>
              <input 
                type="password" 
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                className="w-full p-4 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-700 transition-all" 
                placeholder="••••••••"
                required
              />
            </div>
            {loginError && <p className="text-red-500 text-[10px] font-black uppercase text-center bg-red-50 py-2 rounded-lg">{loginError}</p>}
            <button 
              type="submit"
              className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all transform hover:-translate-y-1 active:translate-y-0"
            >
              MASUK KE SISTEM
            </button>
          </form>

          <div className="mt-12 pt-8 border-t border-slate-50 text-center">
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-3 italic">Demo Akun:</p>
            <div className="inline-block text-left text-[10px] bg-slate-50 p-4 rounded-2xl font-bold text-slate-500">
               <p>Owner: owner / 123</p>
               <p>Karyawan: budi / 123</p>
            </div>
          </div>
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
        />
      ) : (
        <OwnerDashboard 
          employees={users}
          attendance={attendance}
          leaveRequests={leaveRequests}
          outletConfig={outletConfig}
          onUpdateConfig={setOutletConfig}
          onApproveLeave={handleApproveLeave}
          onAddEmployee={handleAddEmployee}
          onEditEmployee={handleEditEmployee}
          onDeleteEmployee={handleDeleteEmployee}
        />
      )}
    </Layout>
  );
};

export default App;
