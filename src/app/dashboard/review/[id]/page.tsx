// File: src/app/dashboard/review/[id]/page.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  getFirestore, 
  doc, 
  collection, 
  onSnapshot, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  updateDoc 
} from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { 
  ShieldAlert, 
  Clock, 
  User, 
  CheckCircle, 
  AlertTriangle, 
  Search, 
  MessageSquare, 
  Send, 
  Plus, 
  FileText, 
  ArrowLeft,
  Briefcase,
  AlertCircle,
  Bell
} from 'lucide-react';
import { initializeApp, getApps } from 'firebase/app';

// Core Firebase configuration initialization
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

export default function PMReviewDashboard() {
  const { id } = useParams();
  const router = useRouter();
  
  const [project, setProject] = useState<any>(null);
  const [dailyLogs, setDailyLogs] = useState<any[]>([]);
  const [observations, setObservations] = useState<any[]>([]);
  const [chatLogs, setChatLogs] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);

  // Form entries configuration states
  const [newLogText, setNewLogText] = useState('');
  const [newMessageText, setNewMessageText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Setup security authentication state listeners
  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, (logged) => {
      setUser(logged);
    });
    return () => unsub();
  }, []);

  // Sync scroll on chat messages block
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLogs]);

  // Dual source real-time sync mapping 
  useEffect(() => {
    if (!id) return;
    const db = getFirestore();

    // Fetch master metadata block
    const projectRef = doc(db, 'projects', id as string);
    const unsubProject = onSnapshot(projectRef, (snap) => {
      if (snap.exists()) {
        setProject({ id: snap.id, ...snap.data() });
      }
    });

    // Fetch Source A: Draft Bi-weekly / Weekly report daily logs
    const journalRef = collection(db, 'project_journals', id as string, 'entries');
    const unsubJournal = onSnapshot(journalRef, (snap) => {
      const logs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDailyLogs(logs);
    });

    // Fetch Source B: Field Site observations (nested sub-collection mapping)
    const obsRef = collection(db, 'field_observations');
    const unsubObs = onSnapshot(obsRef, async (snap) => {
      const gatheredSubs: any[] = [];
      const parentPromises = snap.docs.map(async (parentDoc) => {
        const parentData = parentDoc.data();
        
        // Confirm project scoping mapping match safely
        const isMatched = parentData.projectId === id || 
                          parentData.project_id === id || 
                          (parentData.projectId && String(parentData.projectId).toLowerCase() === String(id).toLowerCase());

        if (isMatched) {
          const subCol = collection(db, 'field_observations', parentDoc.id, 'sub_observations');
          const subSnap = await getDocs(subCol);
          subSnap.forEach((subDoc) => {
            const subData = subDoc.data();
            gatheredSubs.push({
              id: subDoc.id,
              parentObservationId: parentDoc.id,
              location: parentData.location || 'Field Walk Site',
              author: parentData.author || parentData.loggedBy || 'Field Tech',
              projectName: parentData.projectName || 'Active Field Runways',
              ...subData
            });
          });
        }
      });

      await Promise.all(parentPromises);
      setObservations(gatheredSubs);
    }, (error) => {
      console.error("Observation pipeline read error: ", error);
    });

    // Fetch Project Specific Chat Log mentions
    const chatRef = collection(db, 'projects', id as string, 'chat_logs');
    const unsubChat = onSnapshot(chatRef, (snap) => {
      const msgs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setChatLogs(msgs);
    });

    return () => {
      unsubProject();
      unsubJournal();
      unsubObs();
      unsubChat();
    };
  }, [id]);

  // 🔍 DEEP SEARCH RELEVANCE SCORING & SORTING ENGINE
  // Ranks each document based on term matches across its fields for exact deep keyword sorting
  const scoreAndSortData = (items: any[], searchableFields: string[]) => {
    if (!searchQuery.trim()) return items;
    
    const terms = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
    
    return items
      .map(item => {
        let score = 0;
        searchableFields.forEach(field => {
          const content = String(item[field] || "").toLowerCase();
          terms.forEach(term => {
            if (content.includes(term)) {
              score += 15; // Found keyword hit
              
              // Add progressive weight for multiple occurrences
              const occurrences = content.split(term).length - 1;
              score += occurrences * 4;
              
              // Exact matches gain primary priority weighting
              if (content === term) {
                score += 25;
              }
            }
          });
        });
        return { ...item, searchScore: score };
      })
      .filter(item => item.searchScore > 0)
      .sort((a, b) => b.searchScore - a.searchScore);
  };

  const filteredLogs = scoreAndSortData(dailyLogs, ['text', 'loggedBy', 'status']);
  const filteredObs = scoreAndSortData(observations, ['description', 'observationType', 'priority', 'location', 'author']);

  // Extract separate threat scopes clearly for layout views
  const journalRisks = filteredLogs.filter(log => {
    const text = (log.text || "").toLowerCase();
    return text.includes("risk") || text.includes("critical") || text.includes("threat") || text.includes("issue");
  });

  const observationRisks = filteredObs.filter(obs => obs.observationType === 'Risk');

  // 📝 Post a new journal / Draft Bi-weekly entry block
  const handleAddJournalEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLogText.trim() || !user) return;
    setIsSubmitting(true);

    try {
      const db = getFirestore();
      const journalRef = collection(db, 'project_journals', id as string, 'entries');
      await addDoc(journalRef, {
        text: newLogText,
        loggedBy: user.email,
        timestamp: new Date().toISOString(),
        status: "Draft",
        source: "Manual Workbench Entry"
      });
      setNewLogText('');
    } catch (err) {
      console.error("Failed to commit journal: ", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 💬 CHAT LOG MENTION PARSER & PING ROUTER
  // Parses comments for targeted roles/emails to update pingUser triggers and send alerts 
  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessageText.trim() || !user) return;

    try {
      const db = getFirestore();
      const chatRef = collection(db, 'projects', id as string, 'chat_logs');

      let pingUser = "";
      const lowerMessageText = newMessageText.toLowerCase();

      // Check explicit role mappings first to flag Consultant vs. Teams
      if (lowerMessageText.includes("@it consultant") || lowerMessageText.includes("@it")) {
        pingUser = "IT Consultant";
      } else if (lowerMessageText.includes("@orat team") || lowerMessageText.includes("@orat")) {
        pingUser = "ORAT Team";
      } else if (newMessageText.includes("@")) {
        // Sniff exact emails (e.g. @kendallaaron84@gmail.com)
        const emailRegex = /@([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/;
        const matchedEmail = newMessageText.match(emailRegex);
        if (matchedEmail) {
          pingUser = matchedEmail[1];
        } else {
          // Fallback to any username word boundary after @
          const generalRegex = /@(\w+)/;
          const matchedName = newMessageText.match(generalRegex);
          if (matchedName) {
            pingUser = matchedName[1];
          }
        }
      }

      await addDoc(chatRef, {
        text: newMessageText,
        sender: user.email,
        senderName: user.displayName || user.email.split('@')[0],
        createdAt: new Date().toISOString(),
        pingUser, // The exact user target currently pinged
        read: false
      });

      setNewMessageText('');
    } catch (err) {
      console.error("Failed to dispatch chat: ", err);
    }
  };

  return (
    <div className="flex-1 bg-slate-50 p-6 md:p-8 overflow-y-auto space-y-6">
      {/* 🧭 Nav Header and Back Trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => router.push('/dashboard/workbench')}
            className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-all shadow-2xs"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-sky-50 text-sky-600 font-bold px-2 py-0.5 rounded border border-sky-200 uppercase tracking-wider">PM Review Matrix</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">{project?.name || "Active Workspace Hub"}</h1>
          </div>
        </div>

        {/* Dynamic Context Search Bar */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search report logs & observations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all shadow-2xs"
          />
        </div>
      </div>

      {/* 📊 Project Metadata Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <p className="text-xs text-slate-500 font-medium">Assigned Lead</p>
          <p className="text-sm font-bold text-slate-800 mt-1 truncate">{project?.lead || "ORAT Lead Team"}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <p className="text-xs text-slate-500 font-medium">Project Status</p>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 mt-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {project?.status || "Active Execution"}
          </span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <p className="text-xs text-slate-500 font-medium">Bi-weekly Entries</p>
          <p className="text-sm font-bold text-slate-800 mt-1">{dailyLogs.length} Blocks Loaded</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <p className="text-xs text-slate-500 font-medium">Inspection Detections</p>
          <p className="text-sm font-bold text-slate-800 mt-1">{observations.length} Hazards</p>
        </div>
      </div>

      {/* 🚀 Active Risks Grid Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xs">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
          <ShieldAlert className="h-5 w-5 text-red-500" />
          <h2 className="text-lg font-bold text-slate-900">Consolidated Project Threat Monitor</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* A. Journal Report Risks Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center justify-between">
              <span>Risks from Draft Bi-Weekly Reports</span>
              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{journalRisks.length} active</span>
            </h3>
            
            {journalRisks.length === 0 ? (
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-6 text-center">
                <AlertCircle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-500">No report-log risk items match this context.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {journalRisks.map((log: any) => (
                  <div key={log.id} className="bg-slate-50 border border-red-100 hover:border-red-200 rounded-xl p-4 transition-all shadow-3xs">
                    <p className="text-sm text-slate-800 leading-relaxed font-medium">{log.text}</p>
                    <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> {log.loggedBy}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {new Date(log.timestamp).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* B. Field Observation Risks Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center justify-between">
              <span>Risks from Field Observation Reports</span>
              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{observationRisks.length} active</span>
            </h3>

            {observationRisks.length === 0 ? (
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-6 text-center">
                <AlertCircle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-500">No field observation risk items match this context.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {observationRisks.map((obs: any) => (
                  <div key={obs.id} className="bg-slate-50 border border-red-100 hover:border-red-200 rounded-xl p-4 transition-all shadow-3xs">
                    <p className="text-sm text-slate-800 leading-relaxed font-medium">{obs.description}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-500">
                      <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded font-bold uppercase text-[10px]">
                        Priority: {obs.priority || "High"}
                      </span>
                      <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> {obs.author || "Tech"}</span>
                      <span className="flex items-center gap-1 ml-auto"><Clock className="h-3.5 w-3.5" /> {new Date(obs.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>

      {/* 🟢 Split Data Stream Panels (Bi-weekly input and observation logs) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left: Project Journals & Manual Inputs */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-md font-bold text-slate-800 flex items-center gap-2">
              <FileText className="h-4.5 w-4.5 text-sky-500" />
              Project Bi-Weekly Summary Log
            </h2>
            <span className="text-xs text-slate-500">{filteredLogs.length} blocks found</span>
          </div>

          {/* New log entry submission form */}
          <form onSubmit={handleAddJournalEntry} className="space-y-3">
            <textarea
              value={newLogText}
              onChange={(e) => setNewLogText(e.target.value)}
              placeholder="Record bi-weekly field summaries, project decisions, or operational risks..."
              rows={3}
              className="w-full bg-white border border-slate-200 rounded-lg p-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all resize-none shadow-3xs"
            />
            <button
              type="submit"
              disabled={isSubmitting || !newLogText.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-lg text-sm font-semibold transition-all ml-auto cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Commit Log Entry
            </button>
          </form>

          {/* Scrollable logs summary pool */}
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {filteredLogs.map((log: any) => {
              const isRisk = (log.text || "").toLowerCase().includes("risk");
              return (
                <div key={log.id} className={`bg-slate-50 border rounded-lg p-4 transition-all shadow-3xs ${isRisk ? 'border-red-200 bg-red-50/10' : 'border-slate-200'}`}>
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1.5">{log.status || "Assigned"}</p>
                  <p className="text-sm text-slate-700 leading-relaxed">{log.text}</p>
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-200 text-xs text-slate-500">
                    <span className="truncate font-medium">{log.loggedBy}</span>
                    <span>{new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Inspection Detections and Field Observations dropdown mapping */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-md font-bold text-slate-800 flex items-center gap-2">
              <Briefcase className="h-4.5 w-4.5 text-amber-500" />
              Field Observations & Site Inspections
            </h2>
            <span className="text-xs text-slate-500">{filteredObs.length} reports</span>
          </div>

          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {filteredObs.map((obs: any) => {
              const isRisk = obs.observationType === "Risk";
              return (
                <div key={obs.id} className={`bg-slate-50 border rounded-lg p-4 transition-all shadow-3xs ${isRisk ? 'border-red-200 bg-red-50/10' : 'border-slate-200'}`}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded border uppercase tracking-wider font-bold text-[10px] ${
                      isRisk 
                        ? 'bg-rose-50 text-rose-700 border-rose-200' 
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {obs.observationType || "Inspection"}
                    </span>
                    <span className="text-xs text-slate-500 font-bold">{obs.location}</span>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">{obs.description}</p>
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-200 text-xs text-slate-500">
                    <span className="font-medium">Logged by: {obs.author || "Tech"}</span>
                    <span>{new Date(obs.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 🔔 Project Threat Room Chat Logs & Alerts */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xs">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <MessageSquare className="h-5 w-5 text-sky-500" />
          <h2 className="text-lg font-bold text-slate-800">Active Threat Room (RAID Chat Pings)</h2>
        </div>

        {/* Messages display stream */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 h-72 overflow-y-auto space-y-3 shadow-3xs">
          {chatLogs.map((msg: any) => {
            const isMe = msg.sender === user?.email;
            return (
              <div 
                key={msg.id} 
                className={`p-3 rounded-lg max-w-[85%] transition-all shadow-3xs ${
                  isMe 
                    ? 'bg-sky-600 text-white ml-auto' 
                    : 'bg-white border border-slate-200 text-slate-800'
                } ${
                  msg.pingUser ? 'ring-1 ring-amber-400 bg-amber-50/50' : ''
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <p className={`text-xs font-bold ${isMe ? 'text-sky-100' : 'text-slate-500'}`}>{msg.senderName || msg.sender}</p>
                  <span className={`text-[10px] ${isMe ? 'text-sky-200' : 'text-slate-400'}`}>{new Date(msg.createdAt).toLocaleTimeString()}</span>
                  
                  {/* Alert notification bubble for explicit pings */}
                  {msg.pingUser && (
                    <span className={`flex items-center gap-1 text-[10px] border px-1.5 py-0.5 rounded font-bold ${
                      isMe 
                        ? 'bg-sky-700/50 text-white border-sky-500/50'
                        : 'bg-amber-100 text-amber-800 border-amber-200'
                    }`}>
                      <Bell className="h-2.5 w-2.5 animate-bounce" />
                      Pinged {msg.pingUser}
                    </span>
                  )}
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-line">{msg.text}</p>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        {/* Message dispatch panel */}
        <form onSubmit={handleSendChatMessage} className="flex gap-3">
          <input
            type="text"
            value={newMessageText}
            onChange={(e) => setNewMessageText(e.target.value)}
            placeholder="Type message here... Use @IT Consultant or @ORAT Team to ping representatives!"
            className="flex-1 bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all shadow-3xs"
          />
          <button
            type="submit"
            disabled={!newMessageText.trim()}
            className="flex items-center justify-center p-2.5 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-lg transition-all cursor-pointer"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
      </div>
    </div>
  );
}

// Helper utility to safely scan mentions matching roles
function lowerMsgIncludesRole(msg: string, role: string) {
  const normMsg = msg.toLowerCase();
  const normRole = role.toLowerCase();
  if (normRole === 'it consultant') return normMsg.includes('@it') || normMsg.includes('@consultant');
  if (normRole === 'orat team') return normMsg.includes('@orat');
  return false;
}