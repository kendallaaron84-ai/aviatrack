// File: src/app/dashboard/workbench/page.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { HardHat, Plus, Trash2, ArrowRight, AlertCircle, FileText, BookOpen, Send, CalendarDays, Lock, Network, X, TrendingUp, Save, Clock, ShieldAlert, CheckCircle2, Unlock } from "lucide-react";
import { db, auth } from "@/lib/firebase"; 

// Native Firebase Operations
import { collection, addDoc, onSnapshot, query, orderBy, doc, getDoc, setDoc } from "firebase/firestore";

const ACTIVE_PROJECTS = [
  { id: "TDP-15", name: "TDP: New Terminal - 15 (HP)", budget: 12500000.00 },
  { id: "CIP-TC", name: "Terminal C Parking Garage (JE DUNN)", budget: 8500000.00 },
  { id: "GLF-01", name: "Terminal A (GLF) Ground Loading Facility", budget: 510962.66 }
];

const TRADE_DIVISIONS = [
  { code: "Div 08", name: "Door Hardware / Openings" },
  { code: "Div 21", name: "Fire Suppression" },
  { code: "Div 22", name: "Plumbing" },
  { code: "Div 23", name: "HVAC / Mechanical" },
  { code: "Div 26", name: "Electrical" },
  { code: "Div 27", name: "Communications / Low Voltage" },
  { code: "Div 28", name: "Electronic Safety & Security" }
];

export default function ObservationWorkbenchPage() {
  const { toast } = useToast();
  const [selectedProject, setSelectedProject] = useState(ACTIVE_PROJECTS[0].id);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingState, setIsSavingState] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  
  // 🟢 NEW: Administrative Override State
  const [isAdminMode, setIsAdminMode] = useState(false);
  
  const activeProjectData = ACTIVE_PROJECTS.find(p => p.id === selectedProject) || ACTIVE_PROJECTS[0];

  // Persistent States
  const [baselineData, setBaselineData] = useState<any>(null);
  const [baselineForm, setBaselineForm] = useState({ start: "", end: "" });
  const [milestones, setMilestones] = useState<any[]>([]);
  const [dependencies, setDependencies] = useState<any[]>([]);
  const [evm, setEvm] = useState({ plannedValue: 0, earnedValue: 0, actualCost: 0 });

  // Bi-Weekly Modal States
  const [reportForm, setReportForm] = useState({ periodStart: "", periodEnd: "", lookAhead: "", risks: "", impact: "", resolutionPlan: "", actionItems: "" });
  const [statusReports, setStatusReports] = useState<any[]>([]);

  // Journal State
  const [journalEntry, setJournalEntry] = useState("");
  const [journalLogs, setJournalLogs] = useState<any[]>([]);

  // EVM Calculations
  const costVariance = evm.earnedValue - evm.actualCost;
  const scheduleVariance = evm.earnedValue - evm.plannedValue;
  const cpi = evm.actualCost > 0 ? (evm.earnedValue / evm.actualCost).toFixed(2) : "0.00";
  const spi = evm.plannedValue > 0 ? (evm.earnedValue / evm.plannedValue).toFixed(2) : "0.00";
  const currentSpiNum = parseFloat(spi);

  // Helper: Static Milestone Baseline Duration (Static Dates)
  const calculateBaselineDuration = (start: string, end: string) => {
    if (!start || !end) return 0;
    return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000));
  };

  // Helper: Milestone Schedule Variance (Forecast End vs Baseline End)
  const calculateMilestoneVariance = (baselineEnd: string, forecastEnd: string) => {
    if (!baselineEnd || !forecastEnd) return 0;
    return Math.round((new Date(forecastEnd).getTime() - new Date(baselineEnd).getTime()) / 86400000);
  };

  // Helper: Earned Schedule Mathematical Duration (Baseline Days / SPI)
  const calculateEstimatedDuration = (baselineStart: string, baselineEnd: string) => {
    const baseDuration = calculateBaselineDuration(baselineStart, baselineEnd);
    if (baseDuration === 0) return 0;
    if (currentSpiNum <= 0) return baseDuration; 
    return parseFloat((baseDuration / currentSpiNum).toFixed(1));
  };

  // Governance: Scan for Critical Path Overrides across milestones
  const hasCriticalPathBlocker = useMemo(() => {
    return milestones.some(m => m.criticalPathStatus === "🔴 Critical Path Blocked");
  }, [milestones]);

  // Dynamic Counter: Aggregated Construction Dependencies
  const activeConstructionDependenciesCount = dependencies.filter(
    d => d.type === "Trade" && d.status === "Active Block"
  ).length;

  useEffect(() => {
    // 1. Fetch locked macro overall project dates
    const fetchBaseline = async () => {
      const docSnap = await getDoc(doc(db, "project_baselines", selectedProject));
      if (docSnap.exists()) setBaselineData(docSnap.data());
      else setBaselineData(null);
    };
    fetchBaseline();

    // 2. Fetch Persistent Workbench Configuration State
    const fetchWorkbenchState = async () => {
      const stateSnap = await getDoc(doc(db, "project_workbench_states", selectedProject));
      if (stateSnap.exists()) {
        const data = stateSnap.data();
        setMilestones(data.milestones || []);
        setDependencies(data.dependencies || []);
        setEvm(data.evm || { plannedValue: 0, earnedValue: 0, actualCost: 0 });
      } else {
        setMilestones([
          { id: crypto.randomUUID(), type: "Construction", name: "Drywall Complete", baselineStart: "", baselineEnd: "", forecastStart: "", forecastEnd: "", status: "Planned", criticalPathStatus: "🟢 On Track", notes: "" },
          { id: crypto.randomUUID(), type: "IT", name: "Access Control Installation", baselineStart: "", baselineEnd: "", forecastStart: "", forecastEnd: "", status: "Planned", criticalPathStatus: "🟢 On Track", notes: "" }
        ]);
        setDependencies([
          { id: crypto.randomUUID(), type: "Cross-Project", targetEntity: "Terminal C Parking Garage", tradeDivision: "", linkedMilestone: "Access Control Installation", activityTask: "Pathway Handover", status: "Active Block" }
        ]);
        setEvm({ plannedValue: 0, earnedValue: 0, actualCost: 0 });
      }
    };
    fetchWorkbenchState();

    // 3. Fetch Journal Logs
    const qJournal = query(collection(db, "project_journals", selectedProject, "entries"), orderBy("timestamp", "desc"));
    const unsubJournal = onSnapshot(qJournal, (snapshot) => {
      setJournalLogs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 4. Fetch Historical Bi-Weekly Reports
    const qReports = query(collection(db, "project_status_reports", selectedProject, "biweekly_reports"), orderBy("timestamp", "desc"));
    const unsubReports = onSnapshot(qReports, (snapshot) => {
      setStatusReports(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubJournal(); unsubReports(); };
  }, [selectedProject]);

  // GLOBAL STATE SNAPSHOT PERSISTENCE PIPELINE
  const handleSaveWorkbenchState = async () => {
    setIsSavingState(true);
    try {
      const currentUser = auth.currentUser?.email || "Kendall Aaron";
      const timestamp = new Date().toISOString();

      const processedMilestones = milestones.map(m => ({
        ...m,
        baselineDurationDays: calculateBaselineDuration(m.baselineStart, m.baselineEnd),
        estimatedDurationDays: calculateEstimatedDuration(m.baselineStart, m.baselineEnd),
        varianceDays: calculateMilestoneVariance(m.baselineEnd, m.forecastEnd)
      }));

      const macroCalculatedHealth = costVariance < 0 || hasCriticalPathBlocker || currentSpiNum < 1 ? "Critical Risk" : "On Track";

      const savePayload = {
        projectId: selectedProject,
        milestones: processedMilestones,
        dependencies,
        evm,
        statusHealthIndicator: macroCalculatedHealth, 
        lastSavedBy: currentUser,
        lastSavedAt: timestamp
      };

      await setDoc(doc(db, "project_workbench_states", selectedProject), savePayload);
      await addDoc(collection(db, "project_workbench_states", selectedProject, "historical_snapshots"), {
        ...savePayload,
        snapshotTimestamp: timestamp
      });

      toast({ title: "Workbench Settings Saved", description: "Earned Schedule parameters logged to historical timeline." });
    } catch (err) {
      toast({ variant: "destructive", title: "Save Error", description: "Could not persist workbench configuration." });
    } finally {
      setIsSavingState(false);
    }
  };

  const handleLockBaseline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!baselineForm.start || !baselineForm.end) return;
    try {
      const currentUser = auth.currentUser?.email || "Kendall Aaron";
      await setDoc(doc(db, "project_baselines", selectedProject), { start: baselineForm.start, end: baselineForm.end, lockedBy: currentUser, lockedAt: new Date().toISOString() });
      toast({ title: "Master Baseline Locked", description: "Overall project schedule baseline secured." });
      setBaselineData({ start: baselineForm.start, end: baselineForm.end });
    } catch (err) {
      toast({ variant: "destructive", title: "Lock Failed" });
    }
  };

  // Milestone Row Controls
  const handleAddMilestone = (type: "Construction" | "IT") => setMilestones([...milestones, { id: crypto.randomUUID(), type, name: "", baselineStart: "", baselineEnd: "", forecastStart: "", forecastEnd: "", status: "Planned", criticalPathStatus: "🟢 On Track", notes: "" }]);
  const updateMilestone = (id: string, field: string, value: string) => setMilestones(milestones.map(m => m.id === id ? { ...m, [field]: value } : m));
  const removeMilestone = (id: string) => setMilestones(milestones.filter(m => m.id !== id));

  // Dependency Row Controls
  const handleAddDependency = () => setDependencies([...dependencies, { id: crypto.randomUUID(), type: "Trade", targetEntity: "", tradeDivision: "", linkedMilestone: "", activityTask: "", status: "Active Block" }]);
  const updateDependency = (id: string, field: string, value: string) => setDependencies(dependencies.map(d => d.id === id ? { ...d, [field]: value } : d));
  const removeDependency = (id: string) => setDependencies(dependencies.filter(d => d.id !== id));

  // Bi-Weekly Status Locking Trigger
  const handleCommitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const currentUser = auth.currentUser?.email || "Kendall Aaron";
      const timestamp = new Date().toISOString();

      const totalScheduleSlippageDays = milestones.reduce((sum, m) => {
        const delta = calculateMilestoneVariance(m.baselineEnd, m.forecastEnd);
        return sum + (delta > 0 ? delta : 0);
      }, 0);

      const reportingPeriodString = `${reportForm.periodStart} to ${reportForm.periodEnd}`;

      const reportPayload = {
        ...reportForm,
        reportingPeriod: reportingPeriodString,
        evmMetrics: { plannedValue: evm.plannedValue, earnedValue: evm.earnedValue, actualCost: evm.actualCost, costVariance, scheduleVariance, cpi, spi },
        milestonesSnapshot: milestones,
        dependenciesSnapshot: dependencies,
        loggedBy: currentUser,
        timestamp
      };

      await addDoc(collection(db, "project_status_reports", selectedProject, "biweekly_reports"), reportPayload);

      await setDoc(doc(db, "portfolio_rollups", selectedProject), {
        projectId: selectedProject,
        projectName: activeProjectData.name,
        budgetAllocation: activeProjectData.budget,
        costVariance: costVariance,
        scheduleVariance: scheduleVariance,
        cpi: parseFloat(cpi),
        spi: currentSpiNum,
        totalSlippageDays: totalScheduleSlippageDays,
        criticalBlockersCount: activeConstructionDependenciesCount,
        latestPeriod: reportingPeriodString,
        executiveSummaryLookAhead: reportForm.lookAhead,
        currentRisksText: reportForm.risks,
        mitigationPlanText: reportForm.resolutionPlan,
        lastSignOffBy: currentUser,
        lastSignOffAt: timestamp,
        statusHealthIndicator: costVariance < 0 || hasCriticalPathBlocker || totalScheduleSlippageDays > 14 || currentSpiNum < 1 ? "Critical Risk" : "On Track"
      });

      toast({ title: "Report Committed", description: "Bi-weekly report synced to ledger and portfolio dashboard." });
      setReportForm({ periodStart: "", periodEnd: "", lookAhead: "", risks: "", impact: "", resolutionPlan: "", actionItems: "" });
      setIsReportModalOpen(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!journalEntry.trim()) return;
    try {
      await addDoc(collection(db, "project_journals", selectedProject, "entries"), {
        text: journalEntry,
        loggedBy: auth.currentUser?.email || "Kendall Aaron",
        timestamp: new Date().toISOString()
      });
      setJournalEntry("");
      toast({ title: "Journal Updated" });
    } catch (err) { }
  };

  return (
    <div className="max-w-[1650px] mx-auto space-y-6 pb-12 relative font-sans">
      
      {/* CONTROL PANEL BAR */}
      <div className="flex items-center justify-between border-b pb-4 bg-white sticky top-0 z-20 pt-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <HardHat className="h-6 w-6 text-slate-800" /> Project Execution Workbench
          </h1>
          <p className="text-sm text-slate-500 mt-1">Manage macro baselines, milestones, dependencies, and EVM variance.</p>
        </div>
        
        <div className="flex items-end gap-3">
          {/* 🟢 IDENTITY GUARD: Only renders the override toggle if the logged-in user matches your email */}
          {auth.currentUser?.email === "kendallaaron84@gmail.com" && (
            <Button
              onClick={() => {
                setIsAdminMode(!isAdminMode);
                toast({
                  title: !isAdminMode ? "Admin Override Enabled" : "Admin Override Disabled",
                  description: !isAdminMode ? "Static baseline milestone inputs are now unlocked for modifications." : "Static baselines re-secured.",
                  variant: !isAdminMode ? "default" : "secondary"
                });
              }}
              variant={isAdminMode ? "destructive" : "outline"}
              className="h-10 text-xs font-bold gap-1.5 rounded-sm cursor-pointer"
            >
              {isAdminMode ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
              {isAdminMode ? "Lock Baseline Edits" : "Admin Override Mode"}
            </Button>
          )}

          <div className="w-72">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 block">Active Project Target</label>
            <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} className="w-full border border-slate-300 rounded-sm text-sm p-2 shadow-sm bg-white h-10 focus:outline-none">
              {ACTIVE_PROJECTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <Button 
            onClick={handleSaveWorkbenchState} 
            disabled={isSavingState}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 rounded-sm px-4 flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Save className="h-4 w-4" /> {isSavingState ? "Saving..." : "Save Workbench Settings"}
          </Button>

          <Button onClick={() => setIsReportModalOpen(true)} className="bg-[#142E88] hover:bg-[#2b27b5] text-white font-bold h-10 rounded-sm px-4 cursor-pointer shadow-xs">
            <FileText className="h-4 w-4 mr-1.5" /> Draft Status Report
          </Button>
        </div>
      </div>

      {/* HEALTH HUD */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-amber-500 bg-amber-50/10 shadow-xs rounded-sm">
          <CardContent className="p-4 flex justify-between items-center">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Active Construction Trade Blocks</span>
              <div className="text-xl font-black text-amber-700 font-mono mt-1">{activeConstructionDependenciesCount} Blocks</div>
            </div>
            <Network className="h-5 w-5 text-amber-500" />
          </CardContent>
        </Card>

        <Card className={`border-l-4 bg-blue-50/10 shadow-xs rounded-sm ${currentSpiNum >= 1 ? "border-l-emerald-600" : "border-l-red-600"}`}>
          <CardContent className="p-4 flex justify-between items-center">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Schedule Performance Index</span>
              <div className={`text-xl font-black font-mono mt-1 ${currentSpiNum >= 1 ? "text-emerald-600" : "text-red-600"}`}>SPI: {spi}</div>
            </div>
            <TrendingUp className="h-5 w-5 text-slate-400" />
          </CardContent>
        </Card>

        <Card className={`border-l-4 shadow-xs rounded-sm ${hasCriticalPathBlocker ? "border-l-red-600 bg-red-50/20" : "border-l-emerald-600 bg-emerald-50/10"}`}>
          <CardContent className="p-4 flex justify-between items-center">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Critical Path Governance Mode</span>
              <div className={`text-xl font-black mt-1 flex items-center gap-1.5 ${hasCriticalPathBlocker ? "text-red-700" : "text-emerald-700"}`}>
                {hasCriticalPathBlocker ? <><ShieldAlert className="h-5 w-5 animate-pulse text-red-600" /> OVERRIDE: CRITICAL BLOCK</> : <><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Nominal Path Conditions</>}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ROW 1: BASELINE LOGS & TELEMETRY */}
      <div className="grid grid-cols-1 xl:grid-cols-[400px_1fr] gap-6">
        <Card className="border-[#142E88]/30 shadow-sm rounded-sm bg-white">
          <div className="bg-slate-50/80 px-5 py-3 border-b flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#142E88] uppercase tracking-wider flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Overall Project Baseline</h2>
            {baselineData && <Badge className="bg-emerald-100 text-emerald-800 gap-1 rounded-sm"><Lock className="h-3 w-3" /> Locked</Badge>}
          </div>
          <CardContent className="p-5">
            {!baselineData ? (
              <form onSubmit={handleLockBaseline} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Target Start</label><Input type="date" value={baselineForm.start} onChange={e => setBaselineForm({...baselineForm, start: e.target.value})} className="h-9 text-xs" required /></div>
                  <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Target End</label><Input type="date" value={baselineForm.end} onChange={e => setBaselineForm({...baselineForm, end: e.target.value})} className="h-9 text-xs" required /></div>
                </div>
                <Button type="submit" className="w-full bg-[#142E88] hover:bg-[#2b27b5] text-white font-bold h-9 rounded-sm flex items-center justify-center gap-2 cursor-pointer"><Lock className="h-4 w-4" /> Lock Master Baseline</Button>
              </form>
            ) : (
              <div className="grid grid-cols-2 gap-8 text-sm">
                <div className="space-y-1"><span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Locked Start</span><p className="text-lg font-bold text-slate-800 font-mono">{baselineData.start}</p></div>
                <div className="space-y-1"><span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Locked End</span><p className="text-lg font-bold text-slate-800 font-mono">{baselineData.end}</p></div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm rounded-sm bg-white">
          <div className="bg-slate-50/80 px-5 py-3 border-b flex items-center gap-2"><TrendingUp className="h-4 w-4 text-[#142E88]" /><h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Earned Value Management (EVM) Telemetry</h2></div>
          <CardContent className="p-5">
            <div className="grid grid-cols-3 gap-6 mb-4">
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Planned Value (PV)</label><Input type="number" value={evm.plannedValue} onChange={e => setEvm({...evm, plannedValue: Number(e.target.value)})} className="h-9 font-mono" /></div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Earned Value (EV)</label><Input type="number" value={evm.earnedValue} onChange={e => setEvm({...evm, earnedValue: Number(e.target.value)})} className="h-9 font-mono border-[#142E88] bg-blue-50/20" /></div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Actual Cost (AC)</label><Input type="number" value={evm.actualCost} onChange={e => setEvm({...evm, actualCost: Number(e.target.value)})} className="h-9 font-mono" /></div>
            </div>
            <div className="grid grid-cols-4 gap-4 border-t border-slate-100 pt-4">
              <div className="px-2"><span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Cost Variance (CV)</span><span className={`text-xl font-bold font-mono ${costVariance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>${costVariance.toLocaleString()}</span></div>
              <div className="px-2 border-l border-slate-200"><span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Schedule Variance (SV)</span><span className={`text-xl font-bold font-mono ${scheduleVariance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>${scheduleVariance.toLocaleString()}</span></div>
              <div className="px-2 border-l border-slate-200"><span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Cost Perf. Index (CPI)</span><span className={`text-xl font-bold font-mono ${parseFloat(cpi) >= 1 ? 'text-emerald-600' : 'text-red-600'}`}>{cpi}</span></div>
              <div className="px-2 border-l border-slate-200"><span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Schedule Perf. Index (SPI)</span><span className={`text-xl font-bold font-mono ${currentSpiNum >= 1 ? 'text-emerald-600' : 'text-red-600'}`}>{spi}</span></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ROW 2: MILESTONE MANAGEMENT WITH DYNAMIC ADMIN OVERWRITES */}
      <Card className="border-slate-200 shadow-sm rounded-sm bg-white">
        <CardHeader className="bg-slate-50 border-b py-3.5 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5"><Clock className="h-4 w-4 text-[#142E88]" /> Milestone Lifecycle & Earned Schedule Engine</CardTitle>
            <CardDescription className="text-xs">Baseline milestone inputs are locked down to prevent distortion, but can be updated by an Admin if an error occurs.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => handleAddMilestone("Construction")} variant="outline" size="sm" className="h-8 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200 cursor-pointer"><Plus className="h-3 w-3 mr-1" /> Add Const.</Button>
            <Button onClick={() => handleAddMilestone("IT")} variant="outline" size="sm" className="h-8 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200 cursor-pointer"><Plus className="h-3 w-3 mr-1" /> Add IT</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent bg-slate-100/50">
                <TableHead className="text-[10px] font-bold uppercase tracking-wider">Type</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider w-44">Milestone Target Name</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider w-48">Static Baseline Dates</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider w-48">Active Forecast Dates</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-center">Baseline Plan</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-center bg-blue-50/30 text-[#142E88]">Earned Schedule Est.</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-center">Variance</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider w-44 text-red-700">Critical Path Status</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider w-24">Status</TableHead>
                <TableHead className="w-[40px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {milestones.map((m) => {
                const baseDays = calculateBaselineDuration(m.baselineStart, m.baselineEnd);
                const estDays = calculateEstimatedDuration(m.baselineStart, m.baselineEnd);
                const variance = calculateMilestoneVariance(m.baselineEnd, m.forecastEnd);

                return (
                  <TableRow key={m.id} className="hover:bg-slate-50/50 transition-colors">
                    <TableCell><Badge className={`shadow-none text-[10px] font-bold ${m.type === 'Construction' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>{m.type}</Badge></TableCell>
                    <TableCell><Input value={m.name} onChange={e => updateMilestone(m.id, "name", e.target.value)} className="h-8 text-xs font-semibold" placeholder="Milestone Name" /></TableCell>
                    
                    {/* 🟢 BASELINE INPUT BOUNDARIES (Now conditionally unlocked by Admin Mode) */}
                    <TableCell className="space-y-1">
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-bold text-slate-400 w-3">S:</span>
                        <Input 
                          type="date" 
                          disabled={!isAdminMode} 
                          value={m.baselineStart} 
                          onChange={e => updateMilestone(m.id, "baselineStart", e.target.value)} 
                          className={`h-7 text-[10px] px-1 font-mono transition-colors ${!isAdminMode ? "bg-slate-100/70 text-slate-500 cursor-not-allowed border-transparent" : "bg-white border-amber-300"}`} 
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-bold text-slate-400 w-3">E:</span>
                        <Input 
                          type="date" 
                          disabled={!isAdminMode} 
                          value={m.baselineEnd} 
                          onChange={e => updateMilestone(m.id, "baselineEnd", e.target.value)} 
                          className={`h-7 text-[10px] px-1 font-mono transition-colors ${!isAdminMode ? "bg-slate-100/70 text-slate-500 cursor-not-allowed border-transparent" : "bg-white border-amber-300"}`} 
                        />
                      </div>
                    </TableCell>
                    
                    {/* Forecast Inputs remain completely open for PM work */}
                    <TableCell className="space-y-1">
                      <div className="flex items-center gap-1"><span className="text-[9px] font-bold text-slate-400 w-3">S:</span><Input type="date" value={m.forecastStart} onChange={e => updateMilestone(m.id, "forecastStart", e.target.value)} className="h-7 text-[10px] px-1 font-mono" /></div>
                      <div className="flex items-center gap-1"><span className="text-[9px] font-bold text-slate-400 w-3">E:</span><Input type="date" value={m.forecastEnd} onChange={e => updateMilestone(m.id, "forecastEnd", e.target.value)} className="h-7 text-[10px] px-1 font-mono border-blue-200" /></div>
                    </TableCell>
                    
                    <TableCell className="text-center"><span className="text-xs font-bold font-mono text-slate-500">{baseDays}d</span></TableCell>
                    <TableCell className="text-center bg-blue-50/10 border-x border-blue-100/50"><span className={`text-xs font-black font-mono ${estDays > baseDays ? 'text-amber-600' : 'text-emerald-600'}`}>{estDays > 0 ? `${estDays}d` : '--'}</span></TableCell>
                    <TableCell className="text-center"><span className={`text-xs font-bold font-mono ${variance > 0 ? 'text-red-600' : (variance < 0 ? 'text-emerald-600' : 'text-slate-400')}`}>{variance > 0 ? `+${variance}d` : `${variance}d`}</span></TableCell>
                    
                    <TableCell>
                      <select 
                        value={m.criticalPathStatus || "🟢 On Track"} 
                        onChange={e => updateMilestone(m.id, "criticalPathStatus", e.target.value)} 
                        className={`h-8 border rounded-sm text-[10px] font-bold px-1 w-full bg-white ${m.criticalPathStatus === '🔴 Critical Path Blocked' ? 'border-red-200 text-red-600 bg-red-50/50' : m.criticalPathStatus === '🟡 Delayed but Sub-Critical' ? 'border-amber-200 text-amber-600 bg-amber-50/30' : 'border-slate-200 text-emerald-600'}`}
                      >
                        <option value="🟢 On Track">🟢 On Track</option><option value="🟡 Delayed but Sub-Critical">🟡 Delayed but Sub-Critical</option><option value="🔴 Critical Path Blocked">🔴 Critical Path Blocked</option>
                      </select>
                    </TableCell>

                    <TableCell>
                      <select value={m.status} onChange={e => updateMilestone(m.id, "status", e.target.value)} className="h-8 border border-slate-200 rounded-sm text-[10px] font-bold px-1 w-full bg-white">
                        <option value="Planned">Planned</option><option value="In Progress">In Progress</option><option value="Complete">Complete</option><option value="Blocked">Blocked</option>
                      </select>
                    </TableCell>
                    <TableCell><button onClick={() => removeMilestone(m.id)} className="text-red-400 hover:text-red-600 p-1 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ROW 3: RECONFIGURED DEPENDENCY TRACKER */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_450px] gap-6">
        <Card className="border-slate-200 shadow-sm rounded-sm bg-white">
          <CardHeader className="bg-slate-50 border-b py-4 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2"><Network className="h-5 w-5 text-[#885BCE]" /><div><CardTitle className="text-sm font-bold text-slate-800 uppercase tracking-wider">Dependency Tracker</CardTitle><CardDescription className="text-[10px]">Map structural constraints to project tracks or trade divisions.</CardDescription></div></div>
            <Button onClick={handleAddDependency} variant="outline" size="sm" className="h-8 text-xs font-bold text-[#885BCE] border-[#885BCE]/30 hover:bg-[#885BCE]/10 cursor-pointer"><Plus className="h-3 w-3 mr-1" /> Add Link</Button>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider">Dep. Type</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider">Target Entity</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider w-40">Trade Division</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider">Activity / Task</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider">Linked Milestone</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider">Status</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dependencies.map((d) => (
                  <TableRow key={d.id} className="hover:bg-slate-50/50">
                    <TableCell>
                      <select value={d.type} onChange={e => { updateDependency(d.id, "type", e.target.value); if(e.target.value === 'Cross-Project') updateDependency(d.id, "tradeDivision", ""); }} className={`h-8 border rounded-sm text-[10px] px-1 w-24 font-bold ${d.type === 'Cross-Project' ? 'bg-purple-50 text-purple-800 border-purple-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                        <option value="Cross-Project">Cross-Project</option><option value="Trade">Trade Base</option>
                      </select>
                    </TableCell>
                    <TableCell><Input value={d.targetEntity} onChange={e => updateDependency(d.id, "targetEntity", e.target.value)} placeholder={d.type === 'Cross-Project' ? "e.g. Terminal C" : "e.g. Mechanical Contractor"} className="h-8 text-xs bg-white" /></TableCell>
                    <TableCell>
                      {d.type === "Trade" ? (
                        <select value={d.tradeDivision || ""} onChange={e => updateDependency(d.id, "tradeDivision", e.target.value)} className="h-8 border border-slate-200 rounded-sm text-[10px] px-1.5 w-full bg-white font-semibold text-slate-700">
                          <option value="">Select Division...</option>
                          {TRADE_DIVISIONS.map(div => <option key={div.code} value={div.code}>{div.code} - {div.name}</option>)}
                        </select>
                      ) : (<span className="text-[10px] text-slate-400 font-mono italic pl-2">N/A (Cross-Proj)</span>)}
                    </TableCell>
                    <TableCell><Input value={d.activityTask} onChange={e => updateDependency(d.id, "activityTask", e.target.value)} placeholder="e.g. Cable Pulling" className="h-8 text-xs bg-white" /></TableCell>
                    <TableCell><Input value={d.linkedMilestone} onChange={e => updateDependency(d.id, "linkedMilestone", e.target.value)} placeholder="Milestone blocked..." className="h-8 text-xs bg-white" /></TableCell>
                    <TableCell>
                      <select value={d.status} onChange={e => updateDependency(d.id, "status", e.target.value)} className={`h-8 border border-slate-200 rounded-sm text-[10px] px-1 font-bold w-full ${d.status === 'Active Block' ? 'text-red-600 bg-red-50' : 'text-emerald-600 bg-white'}`}>
                        <option value="Active Block">Active Block</option><option value="Resolved">Resolved</option><option value="Monitoring">Monitoring</option>
                      </select>
                    </TableCell>
                    <TableCell><button onClick={() => removeDependency(d.id)} className="text-red-400 hover:text-red-600 p-1 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* JOURNAL */}
        <Card className="border-slate-200 shadow-sm rounded-sm flex flex-col h-[400px] bg-white">
          <div className="bg-slate-50/80 px-5 py-3 border-b flex items-center justify-between"><h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2"><BookOpen className="h-4 w-4 text-emerald-600" /> PM Executive Journal</h2></div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
            {journalLogs.length === 0 ? <div className="text-center text-slate-400 text-sm italic py-8">No narrative entries logged.</div> : (
              journalLogs.map(log => (
                <div key={log.id} className="bg-white border border-slate-200 p-3 rounded-sm shadow-sm space-y-1">
                  <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 uppercase tracking-wider"><span>{log.loggedBy.split('@')[0]}</span><span>{new Date(log.timestamp).toLocaleString()}</span></div>
                  <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">{log.text}</p>
                </div>
              ))
            )}
          </div>
          <div className="p-3 border-t bg-white">
            <form onSubmit={handleLogJournal} className="flex flex-col gap-2">
              <Textarea placeholder="Chronological updates..." value={journalEntry} onChange={e => setJournalEntry(e.target.value)} className="min-h-[60px] text-xs resize-none rounded-sm bg-white" />
              <Button type="submit" disabled={!journalEntry.trim()} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-8 text-[10px] self-end cursor-pointer"><Send className="h-3 w-3 mr-1" /> Log Entry</Button>
            </form>
          </div>
        </Card>
      </div>

      {/* HISTORICAL REPORTS LEDGER */}
      <Card className="border-slate-200 shadow-sm rounded-sm bg-white mt-6">
        <CardHeader className="bg-slate-50 border-b py-4"><CardTitle className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2"><FileText className="h-4 w-4 text-slate-500" /> Historical Bi-Weekly Status Reports</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {statusReports.length === 0 ? <div className="p-8 text-center text-slate-400 text-sm italic">No status reports have been generated yet.</div> : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-bold text-slate-700">Date Logged</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700">Reporting Period</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700">Submitted By</TableHead>
                  <TableHead className="text-xs font-bold text-slate-700">Performance (SPI / CPI)</TableHead>
                  <TableHead className="text-xs font-bold text-right text-slate-700">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statusReports.map(report => (
                  <TableRow key={report.id} className="hover:bg-slate-50/50 transition-colors">
                    <TableCell className="text-xs font-mono font-medium text-slate-700">{new Date(report.timestamp).toLocaleDateString()}</TableCell>
                    <TableCell className="text-xs font-semibold text-[#142E88]">{report.reportingPeriod}</TableCell>
                    <TableCell className="text-xs text-slate-500">{report.loggedBy}</TableCell>
                    <TableCell className="text-xs font-mono font-bold">
                      <span className={parseFloat(report.evmMetrics?.spi) < 1 ? 'text-red-600' : 'text-emerald-600'}>SPI: {report.evmMetrics?.spi || 'N/A'}</span>
                      <span className="text-slate-300 mx-2">|</span>
                      <span className={parseFloat(report.evmMetrics?.cpi) < 1 ? 'text-red-600' : 'text-emerald-600'}>CPI: {report.evmMetrics?.cpi || 'N/A'}</span>
                    </TableCell>
                    <TableCell className="text-right"><Button variant="ghost" size="sm" className="text-xs font-bold text-[#142E88] h-8 cursor-pointer">View Snapshot</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* DRAFT REPORT MODAL */}
      {isReportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-[#142E88] text-white rounded-t-lg">
              <div className="flex items-center gap-2"><FileText className="h-5 w-5 text-emerald-400" /><div><h2 className="text-sm font-bold uppercase tracking-widest">Draft Bi-Weekly Status Report</h2></div></div>
              <button onClick={() => setIsReportModalOpen(false)} className="text-slate-300 hover:text-white transition-colors p-1 cursor-pointer"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <form id="biweekly-form" onSubmit={handleCommitReport} className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-bold text-slate-700 mb-1">Period Start</label><Input type="date" value={reportForm.periodStart} onChange={e => setReportForm({...reportForm, periodStart: e.target.value})} className="h-9 text-sm rounded-sm bg-white" required /></div>
                  <div><label className="block text-xs font-bold text-slate-700 mb-1">Period End</label><Input type="date" value={reportForm.periodEnd} onChange={e => setReportForm({...reportForm, periodEnd: e.target.value})} className="h-9 text-sm rounded-sm bg-white" required /></div>
                </div>
                <div><label className="block text-xs font-bold text-slate-700 mb-1">3-Week Look Ahead</label><Textarea placeholder="- Trade handover next week..." value={reportForm.lookAhead} onChange={e => setReportForm({...reportForm, lookAhead: e.target.value})} className="text-xs rounded-sm resize-none bg-white" rows={3} required /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-bold text-slate-700 mb-1 text-red-600"><AlertCircle className="h-3 w-3 inline mr-1" /> Risks</label><Textarea placeholder="Identify blockers..." value={reportForm.risks} onChange={e => setReportForm({...reportForm, risks: e.target.value})} className="text-xs rounded-sm resize-none border-red-200 bg-white" rows={2} required /></div>
                  <div><label className="block text-xs font-bold text-slate-700 mb-1">Impact</label><Textarea placeholder="Financial or schedule impact..." value={reportForm.impact} onChange={e => setReportForm({...reportForm, impact: e.target.value})} className="text-xs rounded-sm resize-none bg-white" rows={2} required /></div>
                </div>
                <div><label className="block text-xs font-bold text-slate-700 mb-1">Resolution Plan</label><Textarea placeholder="Describe specific mitigation..." value={reportForm.resolutionPlan} onChange={e => setReportForm({...reportForm, resolutionPlan: e.target.value})} maxLength={500} className="text-xs rounded-sm resize-none bg-white" rows={3} required /></div>
                <div><label className="block text-xs font-bold text-slate-700 mb-1">Action Items Required</label><Textarea placeholder="List outstanding decisions..." value={reportForm.actionItems} onChange={e => setReportForm({...reportForm, actionItems: e.target.value})} className="text-xs rounded-sm resize-none bg-white" rows={2} /></div>
              </form>
            </div>
            <div className="p-4 border-t bg-slate-50 flex justify-end gap-3 rounded-b-lg">
              <Button type="button" onClick={() => setIsReportModalOpen(false)} variant="outline" className="text-slate-600 text-xs font-bold cursor-pointer">Cancel</Button>
              <Button form="biweekly-form" type="submit" disabled={isSubmitting} className="bg-[#142E88] hover:bg-[#2b27b5] text-white font-bold h-9 rounded-sm flex items-center justify-center gap-2 cursor-pointer">Save Bi-Weekly Report</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}