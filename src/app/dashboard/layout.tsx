// File: src/app/dashboard/layout.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Database, 
  Map, 
  Briefcase, 
  FileText, 
  Settings, 
  User, 
  LogOut, 
  Menu, 
  X,
  Layers,
  Activity,
  ShieldCheck,
  Eye,
  EyeOff,
  Bell,
  MessageSquare,
  Lock,
  PieChart
} from 'lucide-react';
import { getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { collectionGroup, query, where, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { getPermissions } from "@/lib/security";
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login";
import { Button } from "@/components/ui/button";
import { auth, db } from "@/lib/firebase";

// 👥 SYSTEM REGISTRY TO LINK LOGGED-IN EMAILS TO SYSTEM HANDLES
const PROJECT_TEAM = [
  { name: "Kendall Aaron", email: "kendallaaron84@gmail.com", handle: "kendall", role: "Program Manager" },
  { name: "Kassaundra Salinas", email: "kassaundra.salinas@sanantonio.gov", handle: "kassie", role: "Project Manager" },
  { name: "Lejandro Ligeralde", email: "lejandro.ligeralde@sanantonio.gov", handle: "lejandro", role: "Project Manager" },
  { name: "Ytevia Watts", email: "ytevia.watts@sanantonio.gov", handle: "ytevia", role: "Portfolio Manager" },
  { name: "John Perez", email: "john.perez2@sanantonio.gov", handle: "john", role: "IT Physical Security Specialist" },
  { name: "Ricardo Briseno", email: "ricardo.briseno@sanantonio.gov", handle: "ricardo", role: "Network Engineer" },
  { name: "Andrew Jaffee", email: "andrew.jafee@sanantonio.gov", handle: "andrew", role: "Sr. IT Network Manager" }
];

export function GlobalHeaderNotificationHub() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const currentUserEmail = auth.currentUser?.email || "";
  
  // 🧠 FIX: Translate crude email prefix to official system mention handle
  const systemHandle = useMemo(() => {
    if (!currentUserEmail) return "";
    const matched = PROJECT_TEAM.find(u => u.email.toLowerCase() === currentUserEmail.toLowerCase());
    return matched ? matched.handle : currentUserEmail.split("@")[0].toLowerCase();
  }, [currentUserEmail]);
  
  useEffect(() => {
    if (!currentUserEmail || !systemHandle) return;

    // Queries real-time updates using the clean unified database tag identifier
    const q = query(
      collectionGroup(db, "portfolio_questions"),
      where("mentionFlag", "==", true),
      where("notifiedTarget", "==", systemHandle)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const activeAlerts = snapshot.docs.map(d => {
        const data = d.data();
        const pathSegments = d.ref.path.split("/");
        const observationId = pathSegments[1];

        return {
          id: d.id,
          docPath: d.ref.path, 
          observationId,
          text: data.text,
          author: data.author?.split("@")[0] || "Team Member",
          createdAt: data.createdAt
        };
      });

      activeAlerts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setNotifications(activeAlerts);
    }, (error) => console.error("Firestore portfolio notifications listener error:", error));

    return () => unsubscribe();
  }, [currentUserEmail, systemHandle]);

  const handleNotificationClick = async (docPath: string) => {
    try {
      await setDoc(doc(db, docPath), { mentionFlag: false }, { merge: true });
      setIsOpen(false); 
    } catch (err) {
      console.error("Failed to clear operational notification token:", err);
    }
  };

  const unreadCount = notifications.length;

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-400 hover:text-white transition-colors focus:outline-none cursor-pointer rounded-full hover:bg-slate-800"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 h-3.5 w-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center animate-bounce">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
            <div className="absolute left-0 md:left-auto md:right-0 md:translate-x-[50px] mt-2 w-72 bg-white border border-slate-200 shadow-xl rounded-sm z-50 overflow-hidden font-sans text-slate-900 animate-in fade-in slide-in-from-top-2">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">System Alerts</span>
            <div className="flex items-center gap-2">
              <span className="text-[9px] bg-blue-50 text-[#142E88] px-1.5 py-0.5 rounded-xs font-mono font-bold">
                {unreadCount} New
              </span>
              <button 
                onClick={() => setIsOpen(false)} 
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[260px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 italic">
                No active notifications tagged to your profile layout.
              </div>
            ) : (
              notifications.map((alert) => (
                <Link
                  key={alert.id}
                  href={`/dashboard/review/${alert.observationId}`}
                  onClick={() => handleNotificationClick(alert.docPath)} 
                  className="p-3 block hover:bg-slate-50/80 transition-colors group"
                >
                  <div className="flex gap-2 items-start text-xs">
                    <MessageSquare className="h-3.5 w-3.5 text-[#3c38d4] mt-0.5 shrink-0" />
                    <div className="space-y-1 min-w-0 flex-1">
                      <p className="text-slate-600 font-medium leading-relaxed">
                        <strong className="text-slate-900">@{alert.author}</strong>: "{alert.text}"
                      </p>
                      <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono pt-0.5">
                        <span className="font-bold text-[#142E88] group-hover:underline">
                          Open Record →
                        </span>
                        <span>
                          {alert.createdAt ? new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsInitializing(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (auth.currentUser) {
        try {
          await auth.currentUser.getIdToken(true);
          console.log("Session keep-alive: Token proactively refreshed.");
        } catch (err) {
          console.error("Session keep-alive token refresh failed:", err);
        }
      }
    }, 45 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoginError("");
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err: any) {
      console.error(err);
      if (err.message.includes("invalid-credential") || err.message.includes("auth/user-not-found") || err.message.includes("auth/wrong-password")) {
        setLoginError("Invalid email or password. Please verify your credentials.");
      } else {
        setLoginError(`Sign-in failed: ${err.message}`);
      }
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setMobileMenuOpen(false);
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-sm font-medium text-slate-500 animate-pulse">Synchronizing Session...</div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <form onSubmit={handlePasswordLogin} className="p-8 bg-white shadow-md border rounded-xl max-w-md w-full space-y-4 font-sans">
          <div className="text-center space-y-2">
            <Lock className="h-8 w-8 text-[#142E88] mx-auto" />
            <h2 className="text-xl font-bold text-[#142E88]">_._</h2>
            <p className="text-xs text-slate-500">Sign in using your assigned project profile.</p>
          </div>
          
          {loginError && (
            <p className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200 break-words">
              {loginError}
            </p>
          )}

          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-600">Email Address</label>
            <input 
              type="email" 
              placeholder="user@mail.com" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              className="w-full rounded-md border p-2 text-sm bg-white text-slate-950 focus:outline-none focus:ring-1 focus:ring-blue-500" 
              required 
            />
            
            <label className="block text-xs font-semibold text-slate-600">Password</label>
            <div className="relative flex items-center">
              <input 
                type={showPassword ? "text" : "password"} 
                placeholder="••••••••" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                className="w-full rounded-md border p-2 pr-10 text-sm bg-white text-slate-950 focus:outline-none focus:ring-1 focus:ring-blue-500" 
                required 
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)} 
                className="absolute right-3 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          
          <Button type="submit" className="w-full bg-[#142E88] text-white py-2 font-medium hover:bg-[#1f3ab3] rounded-md">
            Sign In with Password
          </Button>

          <div className="relative flex py-2 items-center">
            <div className="flex-1 border-t border-slate-200"></div>
            <span className="shrink-0 mx-4 text-[10px] text-slate-400 font-bold uppercase tracking-wider">Or Continue With</span>
            <div className="flex-1 border-t border-slate-200"></div>
          </div>

          <Button 
            type="button" 
            onClick={() => initiateGoogleSignIn(auth)} 
            className="w-full bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2 border border-slate-300 rounded-md flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
              <path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.866-3.577-7.866-8s3.536-8 7.866-8c2.46 0 4.105 1.025 5.047 1.926l3.227-3.11C18.28 1.845 15.448 1 12.24 1 5.48 1 0 6.48 0 13.2s5.48 12.2 12.24 12.2c7.055 0 11.75-4.96 11.75-11.96 0-.81-.087-1.425-.195-1.955H12.24z"/>
            </svg>
            Sign in with SSO Email
          </Button>
        </form>
      </div>
    );
  }

  const permissions = getPermissions(currentUser.email);
  const userRole = permissions.role;

  const isMasterAdmin = userRole === "PROGRAM_MANAGER";
  const isPortfolioManager = userRole === "PORTFOLIO_MANAGER";
  const isProjectManager = userRole === "PROJECT_MANAGER";
  const isNetworkEngineer = userRole === "NETWORK_ENGINEER";

  // Granular Sidebar Render Access Conditionals
  const showPortfolioDashboard = isMasterAdmin || isPortfolioManager;
  const showPmDashboard = true; 
  const showProjectWorkbench = isMasterAdmin || isPortfolioManager || isProjectManager;
  const showDrawingsAndBulletins = !isNetworkEngineer;
  const showDocuments = !isNetworkEngineer;
  const showFieldReportForm = true; 
  const showSpatialMap = isMasterAdmin || isPortfolioManager;
  const showFinancialLedger = isMasterAdmin || isPortfolioManager || isProjectManager;
  const showAdminConsole = isMasterAdmin;

  const navItems = [];
  if (showPortfolioDashboard) {
    navItems.push({ name: 'Portfolio Dashboard', href: '/dashboard/executive', icon: PieChart });
  }
  if (showPmDashboard) {
    navItems.push({ name: 'PM Dashboard', href: '/dashboard', icon: LayoutDashboard });
  }
  if (showProjectWorkbench) {
    navItems.push({ name: 'Project Workbench', href: '/dashboard/workbench', icon: Briefcase });
  }
  // 🔐 Updated label to 'PM Risk Registry' and preserved route stability
  if (showProjectWorkbench && ["PORTFOLIO_MANAGER", "PROGRAM_MANAGER", "PROJECT_MANAGER"].includes(userRole)) {
    navItems.push({ name: 'PM Risk Registry', href: '/dashboard/workbench/cluster', icon: Activity });
  }
  if (showDrawingsAndBulletins) {
    navItems.push({ name: 'Drawings & Bulletins', href: '/dashboard/drawings', icon: FileText });
  }
  if (showDocuments) {
    navItems.push({ name: 'Documents', href: '/dashboard/drawings', icon: FileText });
  }
  if (showFieldReportForm) {
    navItems.push({ name: 'Field Observation Report', href: '/field', icon: FileText });
  }
  if (showSpatialMap) {
    navItems.push({ name: 'Spatial Map', href: '/dashboard/map', icon: Map });
  }
  if (showFinancialLedger) {
    navItems.push({ name: 'Financial Ledger', href: '/dashboard/financials', icon: Layers });
  }
  if (showAdminConsole) {
    navItems.push({ name: 'Administrative Console', href: '/dashboard/admin', icon: Settings });
  }

  // Adjusted subpath hierarchy logic so main routes don't cannibalize specific tracks
  const isActive = (path: string) => {
    if (path === '/dashboard') return pathname === '/dashboard';
    if (path === '/dashboard/workbench') return pathname === '/dashboard/workbench';
    return pathname?.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row">
      <header className="flex md:hidden items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 text-slate-100 shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-sky-500/10 flex items-center justify-center border border-sky-500/30">
            <Lock className="h-4 w-4 text-sky-400" />
          </div>
          <span className="font-bold text-md text-white tracking-wider uppercase">_._</span>
        </div>
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </header>

      <aside className="hidden md:flex flex-col w-64 bg-slate-900 text-slate-200 border-r border-slate-800 flex-shrink-0 relative">
        <div className="flex items-center gap-2 px-6 py-6 border-b border-slate-800">
          <div className="h-8 w-8 rounded-lg bg-sky-500/10 flex items-center justify-center border border-sky-500/30">
            <Lock className="h-4 w-4 text-sky-400" />
          </div>
          <span className="font-extrabold text-lg text-white tracking-wider uppercase">_._</span>
        </div>

        <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{permissions.title}</p>
            <p className="text-xs text-white font-bold truncate">{currentUser.email}</p>
          </div>
          <div className="shrink-0">
            <GlobalHeaderNotificationHub />
          </div>
        </div>

        <nav className="flex-1 py-4 px-4 space-y-1 overflow-y-auto text-sm">
          {navItems.map((item, idx) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            const keyId = `${item.href}-${idx}`;
            return (
              <Link
                key={keyId}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md transition-all ${
                  active 
                    ? 'bg-sky-500/15 text-sky-400 border-l-4 border-sky-400 pl-2' 
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-sky-400' : 'text-slate-400'}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 rounded-md transition-all cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Sign Out Session
          </button>
        </div>
      </aside>

      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex text-slate-100">
          <div className="w-4/5 max-w-sm bg-slate-900 p-6 flex flex-col h-full border-r border-slate-800 animate-slide-in">
            <div className="flex items-center justify-between pb-6 border-b border-slate-800 mb-6">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-sky-500/10 flex items-center justify-center border border-sky-500/30">
                  <Lock className="h-4 w-4 text-sky-400" />
                </div>
                <span className="font-extrabold text-md text-white tracking-wider uppercase">_._</span>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="cursor-pointer">
                <X className="h-6 w-6 text-slate-400 hover:text-white" />
              </button>
            </div>

            <div className="px-4 py-3 border border-slate-800 rounded bg-slate-950/40 flex items-center justify-between gap-2 mb-4">
              <div className="min-w-0 flex-1">
                <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">{permissions.title}</p>
                <p className="text-xs text-white font-bold truncate">{currentUser.email}</p>
              </div>
              <div className="shrink-0">
                <GlobalHeaderNotificationHub />
              </div>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto text-sm">
              {navItems.map((item, idx) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                const keyId = `mob-${item.href}-${idx}`;
                return (
                  <Link
                    key={keyId}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md transition-all ${
                      active 
                        ? 'bg-sky-500/15 text-sky-400 border-l-4 border-sky-400 pl-2' 
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                );
              })}
            </nav>

            <div className="pt-6 border-t border-slate-800 flex flex-col gap-3 shrink-0">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-500/10 text-rose-400 rounded-md text-xs font-semibold cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                Sign Out Session
              </button>
            </div>
          </div>
          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-x-hidden p-6">
        {children}
      </main>
    </div>
  );
}
