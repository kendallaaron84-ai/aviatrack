// File: src/app/dashboard/layout.tsx
"use client";

import { useState, useEffect } from "react";
import { getPermissions } from "@/lib/security"; //
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login"; // Make sure the relative path points to your non-blocking file
import Link from "next/link"; //
import { Plane, LayoutDashboard, FileText, Network, HardHat, FileSpreadsheet, ShieldCheck, LogOut, PieChart, Library, Eye, EyeOff, Bell, MessageSquare, AlertCircle } from "lucide-react"; //
import { Button } from "@/components/ui/button"; //
import { auth, db } from "@/lib/firebase"; //

// Native Firebase Operations
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, User } from "firebase/auth"; //
import { collectionGroup, query, where, onSnapshot, doc, setDoc } from "firebase/firestore";

export function GlobalHeaderNotificationHub() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const currentUserEmail = auth.currentUser?.email || "";
  const username = currentUserEmail.split("@")[0].toLowerCase();

  useEffect(() => {
    if (!currentUserEmail) return;

    // FIRESTORE GROUP QUERY: Monitors active task mentions tagged to your profile layout
    const q = query(
      collectionGroup(db, "portfolio_questions"),
      where("mentionFlag", "==", true),
      where("notifiedTarget", "==", username)
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
    });

    return () => unsubscribe();
  }, [currentUserEmail, username]);

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
        <div className="absolute left-0 md:left-auto md:right-0 mt-2 w-72 bg-white border border-slate-200 shadow-xl rounded-sm z-50 overflow-hidden font-sans text-slate-900">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Workspace Mentions</span>
            <span className="text-[9px] bg-blue-50 text-[#142E88] px-1.5 py-0.5 rounded-xs font-mono font-bold">
              {unreadCount} New
            </span>
          </div>

          <div className="divide-y divide-slate-100 max-h-[260px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 italic">
                No active task mentions tagged to your profile layout.
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
  const [user, setUser] = useState<User | null>(null); //
  const [isInitializing, setIsInitializing] = useState(true); //
  
  const [email, setEmail] = useState(""); //
  const [password, setPassword] = useState(""); //
  const [showPassword, setShowPassword] = useState(false); //
  const [loginError, setLoginError] = useState(""); //

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsInitializing(false);
    });
    return () => unsubscribe();
  }, []); //

  const permissions = getPermissions(user?.email); //

  // 🟢 ALIGN PRIVILEGES DIRECTLY WITH CORES SEGMENTATION MATRIX FROM SECURITY.TS
  const isMasterAdmin = permissions.role === "PROGRAM_MANAGER";
  const isPortfolioManager = permissions.role === "PORTFOLIO_MANAGER";
  const isProjectManager = permissions.role === "PROJECT_MANAGER";
  
  // Group all field staff variations to synchronize access rules easily
  const isAnyFieldStaff = [
    "FIELD_ENGINEER", 
    "IT_PHYSICAL_SECURITY", 
    "NETWORK_ENGINEER"
  ].includes(permissions.role);

  // Granular Navigation Render Conditionals
  const showPortfolioDashboard = isMasterAdmin || isPortfolioManager;
  const showPmDashboard = true; 
  const showProjectWorkbench = isMasterAdmin || isPortfolioManager || isProjectManager;
  
  // 🟢 SHIELD LOCKDOWN: If user is part of the field workforce tracks, drawings menu evaluates to false
  const showDrawingsAndBulletins = !isAnyFieldStaff;
  
  const showFieldReportForm = true; 
  const showAirfieldMap = isMasterAdmin || isPortfolioManager;
  const showSapFinancials = isMasterAdmin || isPortfolioManager || isProjectManager;
  const showAdminControlPortal = isMasterAdmin;

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoginError("");
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err: any) {
      console.error(err);
      if (err.message.includes("invalid-credential")) {
        setLoginError("Invalid email or password. Please verify your credentials.");
      } else {
        setLoginError(`Sign-in failed: ${err.message}`);
      }
    }
  }; //

  const handleGoogleSignIn = async () => {
  const provider = new GoogleAuthProvider();
  try {
    // This triggers a secure popup window directly through Google's servers
    const result = await signInWithPopup(auth, provider);
    console.log("Authenticated User:", result.user.email);
  } catch (error) {
    console.error("Google Authentication Failed:", error);
  }
};

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout error", err);
    }
  }; //

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-sm font-medium text-slate-500 animate-pulse">Synchronizing AviaITrack Session...</div>
      </div>
    );
  } //

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <form onSubmit={handlePasswordLogin} className="p-8 bg-white shadow-md border rounded-xl max-w-md w-full space-y-4">
          <div className="text-center space-y-2">
            <Plane className="h-8 w-8 text-[#142E88] mx-auto" />
            <h2 className="text-xl font-bold text-[#142E88]">AviaITrack Control</h2>
            <p className="text-xs text-muted-foreground">Sign in using your assigned project profile.</p>
          </div>
          
          {loginError && (
            <p className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200 break-words">
              {loginError}
            </p>
          )}

          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-600">Email Address</label>
            <input type="email" placeholder="user@mail.com" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-md border p-2 text-sm bg-white" required />
            
            <label className="block text-xs font-semibold text-slate-600">Password</label>
            <div className="relative flex items-center">
              <input 
                type={showPassword ? "text" : "password"} 
                placeholder="••••••••" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                className="w-full rounded-md border p-2 pr-10 text-sm bg-white" 
                required 
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)} 
                className="absolute right-3 text-slate-400 hover:text-slate-600 p-1"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          
          {/* Email / Password Submit Action */}
          <Button type="submit" className="w-full bg-[#142E88] text-white py-2 font-medium">
            Sign In with Password
          </Button>

          {/* 🔘 NEW: EXPLOIT GOOGLE SSO TO BYPASS THE FIREWALL */}
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
            {/* Standard inline SVG for clean Google branding */}
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
              <path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.866-3.577-7.866-8s3.536-8 7.866-8c2.46 0 4.105 1.025 5.047 1.926l3.227-3.11C18.28 1.845 15.448 1 12.24 1 5.48 1 0 6.48 0 13.2s5.48 12.2 12.24 12.2c7.055 0 11.75-4.96 11.75-11.96 0-.81-.087-1.425-.195-1.955H12.24z"/>
            </svg>
            Sign in with COSA Email
          </Button>
        </form>
      
      </div>
    );
  } //

  return (
    <div className="grid min-h-screen w-full md:grid-cols-[260px_1fr]">
      <aside className="hidden border-r bg-slate-900 text-slate-200 md:block relative">
        <div className="flex h-14 items-center border-b border-slate-800 px-6">
          <div className="flex items-center gap-2 font-semibold">
            <Plane className="h-5 w-5 text-[#1EA7F4]" />
            <span className="text-base font-bold">AviaITrack</span>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-400 font-medium">{permissions.title}</p>
            <p className="text-sm text-white font-semibold truncate">{user.email}</p>
          </div>
          <div className="shrink-0">
            <GlobalHeaderNotificationHub />
          </div>
        </div>

        <nav className="p-4 space-y-1 text-sm">
          {showPortfolioDashboard && (
            <Link href="/dashboard/executive" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors">
              <PieChart className="h-4 w-4" /> Portfolio Dashboard
            </Link>
          )}
  
          {showPmDashboard && (
            <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors">
              <LayoutDashboard className="h-4 w-4" /> PM Dashboard
            </Link>
          )}

          {showProjectWorkbench && (
            <Link href="/dashboard/workbench" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors">
              <HardHat className="h-4 w-4 text-[#1EA7F4]" /> Project Workbench
            </Link>
          )}

          {showDrawingsAndBulletins && (
            <Link href="/dashboard/drawings" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors">
              <Library className="h-4 w-4 text-[#1EA7F4]" /> Drawings & Bulletins
            </Link>
          )}

          {showFieldReportForm && (
            <Link href="/field" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors">
              <FileText className="h-4 w-4" /> Field Report Form
            </Link>
          )}

          {showAirfieldMap && (
            <Link href="/dashboard/map" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors">
              <Network className="h-4 w-4 text-[#1EA7F4]" /> Airfield Overlay Map
            </Link>
          )}

          {showSapFinancials && (
            <Link href="/dashboard/financials" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors">
              <FileSpreadsheet className="h-4 w-4" /> SAP / Financial Tracking
            </Link>
          )}

          {showAdminControlPortal && (
            <Link href="/dashboard/admin" className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors">
              <ShieldCheck className="h-4 w-4 text-emerald-500" /> Admin Control Portal
            </Link>
          )}
        </nav>

        <div className="absolute bottom-4 left-4 right-4">
          <Button onClick={handleLogout} variant="ghost" className="w-full justify-start gap-2 text-slate-400 hover:text-white hover:bg-slate-800 text-xs">
            <LogOut className="h-3.5 w-3.5" /> Sign Out
          </Button>
        </div>
      </aside>
      
      <main className="flex-1 p-6 bg-slate-50 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}