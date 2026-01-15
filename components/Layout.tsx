
import React, { useState } from 'react';
import { User, UserRole } from '../types';

interface NavItem {
  id: string;
  label: string;
  icon: string;
}

interface LayoutProps {
  user: User | null;
  onLogout: () => void;
  children: React.ReactNode;
  activeMenu: string;
  setActiveMenu: (id: any) => void;
}

const Layout: React.FC<LayoutProps> = ({ user, onLogout, children, activeMenu, setActiveMenu }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const ownerNav: NavItem[] = [
    { id: 'dashboard', label: 'Antrean Izin', icon: '📝' },
    { id: 'employees', label: 'Manajer Staf', icon: '👥' },
    { id: 'attendance', label: 'Monitoring', icon: '📊' },
    { id: 'payroll', label: 'Payroll', icon: '💳' },
    { id: 'settings', label: 'Sistem', icon: '⚙️' },
  ];

  const employeeNav: NavItem[] = [
    { id: 'home', label: 'Dashboard', icon: '🏠' },
  ];

  const navItems = user?.role === UserRole.OWNER ? ownerNav : employeeNav;

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* MOBILE HEADER */}
      <header className="lg:hidden bg-indigo-900 text-white p-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <span className="text-xl">🧺</span>
          </div>
          <span className="text-sm font-black tracking-widest uppercase">DamDam</span>
        </div>
        <button 
          onClick={toggleMobileMenu}
          className="p-2 hover:bg-white/10 rounded-xl transition-all"
        >
          <span className="text-xl">{isMobileMenuOpen ? '✕' : '☰'}</span>
        </button>
      </header>

      {/* MAIN SIDEBAR */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-72 bg-indigo-900 text-white transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-auto
        ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
      `}>
        <div className="h-full flex flex-col p-8">
          {/* Logo */}
          <div className="flex items-center space-x-4 mb-10">
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-xl shadow-black/20">
               <span className="text-2xl">🧺</span>
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tighter uppercase leading-none">DamDam</h1>
              <div className="flex items-center space-x-2 mt-1">
                 <div className="w-1 h-1 bg-green-400 rounded-full animate-pulse"></div>
                 <p className="text-[8px] font-bold text-indigo-400 uppercase tracking-widest">Cloud Active</p>
              </div>
            </div>
          </div>

          {/* User Profile */}
          {user && (
            <div className="bg-white/10 border border-white/10 rounded-[32px] p-6 mb-8">
              <div className="flex items-center space-x-4 mb-4">
                <div className="w-12 h-12 bg-indigo-500 rounded-full flex items-center justify-center font-black text-lg border-2 border-indigo-400">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="overflow-hidden">
                  <p className="text-sm font-black truncate">{user.name}</p>
                  <p className="text-[9px] font-black text-indigo-300 uppercase tracking-widest">{user.role}</p>
                </div>
              </div>
              <div className="h-px bg-white/10 w-full mb-4" />
              <div className="flex justify-between items-center text-[9px] font-black">
                <span className="text-indigo-400 uppercase">Status</span>
                <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded-md">AKTIF</span>
              </div>
            </div>
          )}

          {/* Navigation Items */}
          <nav className="flex-1 space-y-2">
            <p className="text-[9px] font-black text-indigo-500 uppercase tracking-[0.3em] mb-4 ml-2">Menu Utama</p>
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveMenu(item.id);
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center space-x-3 px-6 py-4 rounded-2xl font-bold text-xs transition-all duration-200 ${
                  activeMenu === item.id 
                    ? 'bg-white text-indigo-900 shadow-xl' 
                    : 'text-indigo-200 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="uppercase tracking-widest font-black text-[10px]">{item.label}</span>
              </button>
            ))}
          </nav>

          {/* Footer & Logout */}
          <div className="mt-auto pt-8">
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                onLogout();
              }}
              className="w-full flex items-center justify-center space-x-3 bg-red-500 hover:bg-red-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-red-900/20 active:scale-95"
            >
              <span>🚪</span>
              <span>Log Out</span>
            </button>
            <p className="text-center text-[8px] font-black text-indigo-500 uppercase tracking-widest mt-6">
              &copy; {new Date().getFullYear()} DamDam Laundry
            </p>
          </div>
        </div>
      </aside>

      {/* OVERLAY */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* CONTENT */}
      <main className="flex-1 h-screen overflow-y-auto">
        <div className="max-w-7xl mx-auto p-4 md:p-8 lg:p-12">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
