// File: src/app/dashboard/layout.tsx
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Database, 
  Map, 
  Briefcase, 
  FileText, 
  Settings, 
  ShieldAlert, 
  User, 
  LogOut, 
  Menu, 
  X,
  Layers,
  Activity
} from 'lucide-react';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';

// Safe environment loader
const firebaseConfig = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
} : null;

if (firebaseConfig && getApps().length === 0) {
  initializeApp(firebaseConfig);
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
      } else {
        setCurrentUser(null);
      }
    });
    return () => unsub();
  }, []);

  const handleLogout = async () => {
    const auth = getAuth();
    await signOut(auth);
    window.location.href = '/login';
  };

  const navItems = [
    { name: 'Portfolio Overview', href: '/dashboard', icon: LayoutDashboard },
    { name: 'PM Workbench', href: '/dashboard/workbench', icon: Briefcase },
    { name: 'Spatial Map', href: '/dashboard/map', icon: Map },
    { name: 'Financial Ledger', href: '/dashboard/financials', icon: Layers },
    { name: 'Documents & Design', href: '/dashboard/drawings', icon: FileText },
    { name: 'Administrative Console', href: '/dashboard/admin', icon: Settings },
  ];

  const isActive = (path: string) => {
    if (path === '/dashboard') return pathname === '/dashboard';
    return pathname?.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      {/* 📱 Mobile Navbar Header */}
      <header className="flex md:hidden items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          {/* Neutral Project Icon replacing old AviaITrack plane elements */}
          <div className="h-8 w-8 rounded-lg bg-sky-500/10 flex items-center justify-center border border-sky-500/30">
            <Activity className="h-4 w-4 text-sky-400" />
          </div>
          <span className="font-bold text-md text-white tracking-wider uppercase">PMO Portal</span>
        </div>
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="text-slate-400 hover:text-white transition-colors"
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </header>

      {/* 🖥️ Desktop Left Navigation Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-slate-900 border-r border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-2 px-6 py-6 border-b border-slate-800">
          {/* Fully Scrubbed branding matching your boss's criteria */}
          <div className="h-8 w-8 rounded-lg bg-sky-500/10 flex items-center justify-center border border-sky-500/30">
            <Activity className="h-4 w-4 text-sky-400" />
          </div>
          <span className="font-extrabold text-lg text-white tracking-wider uppercase">PMO Portal</span>
        </div>

        <nav className="flex-1 py-6 px-4 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  active 
                    ? 'bg-sky-500/15 text-sky-400 border-l-4 border-sky-500 pl-3' 
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                }`}
              >
                <Icon className={`h-4.5 w-4.5 ${active ? 'text-sky-400' : 'text-slate-400'}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User context footer block */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex flex-col gap-2">
          {currentUser && (
            <div className="flex items-center gap-2 px-2 py-1">
              <div className="h-8 w-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
                <User className="h-4 w-4 text-slate-300" />
              </div>
              <div className="truncate flex-1">
                <p className="text-xs text-slate-400 font-medium truncate">{currentUser.email}</p>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
          >
            <LogOut className="h-4 w-4" />
            Sign Out Session
          </button>
        </div>
      </aside>

      {/* Mobile Drawer Overlay navigation logic */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex">
          <div className="w-4/5 max-w-sm bg-slate-900 p-6 flex flex-col h-full border-r border-slate-800 animate-slide-in">
            <div className="flex items-center justify-between pb-6 border-b border-slate-800 mb-6">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-sky-500/10 flex items-center justify-center border border-sky-500/30">
                  <Activity className="h-4 w-4 text-sky-400" />
                </div>
                <span className="font-extrabold text-md text-white tracking-wider uppercase">PMO Portal</span>
              </div>
              <button onClick={() => setMobileMenuOpen(false)}>
                <X className="h-6 w-6 text-slate-400 hover:text-white" />
              </button>
            </div>

            <nav className="flex-1 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                      active 
                        ? 'bg-sky-500/15 text-sky-400 border-l-4 border-sky-500 pl-3' 
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                    }`}
                  >
                    <Icon className="h-4.5 w-4.5" />
                    {item.name}
                  </Link>
                );
              })}
            </nav>

            <div className="pt-6 border-t border-slate-800 flex flex-col gap-3">
              {currentUser && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-slate-400" />
                  <span className="text-xs text-slate-300 truncate">{currentUser.email}</span>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-2.5 bg-rose-500/10 text-rose-400 rounded-lg text-xs font-semibold"
              >
                <LogOut className="h-4 w-4" />
                Sign Out Session
              </button>
            </div>
          </div>
          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      {/* Main workspace routing target */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-950 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}