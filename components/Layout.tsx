
import React from 'react';
import { User, UserRole } from '../types';

interface LayoutProps {
  user: User | null;
  onLogout: () => void;
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ user, onLogout, children }) => {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-indigo-700 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <svg className="w-8 h-8 fill-current" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
            </svg>
            <span className="text-xl font-bold tracking-tight">DamDam Laundry</span>
          </div>
          {user && (
            <div className="flex items-center space-x-4">
              <div className="hidden md:block text-right">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-indigo-200 uppercase tracking-widest">{user.role}</p>
              </div>
              <button
                onClick={onLogout}
                className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-indigo-400"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
      <footer className="bg-white border-t py-6 text-center text-slate-500 text-sm">
        &copy; {new Date().getFullYear()} DamDam Laundry Management System
      </footer>
    </div>
  );
};

export default Layout;
