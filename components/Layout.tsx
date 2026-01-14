
import React from 'react';
import { User, UserRole } from '../types';

interface LayoutProps {
  user: User | null;
  onLogout: () => void;
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ user, onLogout, children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-indigo-700 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 md:h-20 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-white/20 rounded-xl flex items-center justify-center">
               <span className="text-xl">🧺</span>
            </div>
            <span className="text-lg md:text-xl font-black tracking-tight uppercase">DamDam</span>
          </div>
          {user && (
            <div className="flex items-center space-x-3 md:space-x-4">
              <div className="hidden sm:block text-right">
                <p className="text-xs font-black uppercase opacity-80">{user.role}</p>
                <p className="text-sm font-bold">{user.name}</p>
              </div>
              <button
                onClick={onLogout}
                className="bg-white/10 hover:bg-white/20 px-3 py-2 md:px-4 md:py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all border border-white/20"
              >
                Keluar
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 md:py-10">
        {children}
      </main>
      <footer className="bg-white border-t py-6 text-center text-slate-400 text-[10px] font-black uppercase tracking-widest">
        &copy; {new Date().getFullYear()} DamDam Laundry System
      </footer>
    </div>
  );
};

export default Layout;
