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
import { 
  HardHat, Plus, Trash2, ArrowRight, AlertCircle, FileText, BookOpen, Send, CalendarDays, 
  Lock, Network, X, TrendingUp, Save, Clock, ShieldAlert, CheckCircle2, Unlock, Search, 
  Download, Paperclip, Sparkles, AlertTriangle, Activity, History 
} from "lucide-react";
import { db, auth } from "@/lib/firebase"; 
import { collection, addDoc, onSnapshot, query, orderBy, doc, getDoc, setDoc, getDocs } from "firebase/firestore";
import { durationDays, varianceDays } from "@/lib/date-utils";
import { legacyReportNumber } from "@/lib/field-observation-utils";

// STATIC CONSTANTS (Must be outside the component)
const TRADE_DIVISIONS = [
  { code: "Div 03", name: "Concrete" },
  { code: "Div 08", name: "Openings" },
  { code: "Div 09", name: "Finishes" },
  { code: "Div 11", name: "Equipment" },
  { code: "Div 14", name: "Conveying Equipment" },
  { code: "Div 21", name: "Fire Suppression" },
  { code: "Div 22", name: "Plumbing" },
  { code: "Div 23", name: "HVAC & Mech." },
  { code: "Div 26", name: "Electrical" },
  { code: "Div 27", name: "Communications (IT)" },
  { code: "Div 28", name: "Electronic Safety & Security" }
];

// Natural sorting compare helper
const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

const sortLevels = (a: string, b: string) => {
  const isAUnassigned = a === "Unassigned Floor Levels";
  const isBUnassigned = b === "Unassigned Floor Levels";
  if (isAUnassigned && !isBUnassigned) return 1;
  if (!isAUnassigned && isBUnassigned) return -1;
  return naturalCompare(a, b);
};

export default function ObservationWorkbenchPage() {
  const { toast } = useToast();

  // 1. CORE APPLICATION STATES
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [availableProjects, setAvailableProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingState, setIsSavingState] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  
  // 2. DATA MODULE STATES
  const [baselineData, setBaselineData] = useState<any>(null);
  const [baselineForm, setBaselineForm] = useState({ start: "", end: "" });
  const [milestones, setMilestones] = useState<any[]>([]);
  const [dependencies, setDependencies] = useState<any[]>([]);
  const [evm, setEvm] = useState({ plannedValue: 0, earnedValue: 0, actualCost: 0 });
  const [journalEntry, setJournalEntry] = useState("");
  const [journalLogs, setJournalLogs] = useState<any[]>([]);
  const [statusReports, setStatusReports] = useState<any[]>([]);

  // 3. CORRESPONDENCE LEDGER STATES
  const [emailSearch, setEmailSearch] = useState("");
  const [newEmailLog, setNewEmailLog] = useState({ subject: "", sender: "", content: "", systemTag: "General / Correspondence" });
  const [emailLogs, setEmailLogs] = useState<any[]>([]);

  // 4. AI & REPORTING STATES
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportForm, setReportForm] = useState({ periodStart: "", periodEnd: "", lookAhead: "", risks: "", impact: "", resolutionPlan: "", actionItems: "" });
  const [viewingSnapshot, setViewingSnapshot] = useState<any>(null);
  
  // 🆕 BUG FIX: Independent state for context trade editor to resolve modal collision
  const [editingMilestone, setEditingMilestone] = useState<any>(null);

  // Fallback for active project data
  const activeProjectData = availableProjects.find(p => p.id === selectedProject) || { name: "Loading...", budget: 0 };

  // 5. SCREEN ACCORDION & VISIBILITY STATE
  const [isMilestoneSectionCollapsed, setIsMilestoneSectionCollapsed] = useState(false);

  const [initialState, setInitialState] = useState<string>("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    if (!initialState) {
      setHasUnsavedChanges(false);
      return;
    }
    const currentState = JSON.stringify({ milestones, dependencies, evm });
    setHasUnsavedChanges(initialState !== currentState);
  }, [initialState, milestones, dependencies, evm]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = ''; // Required for browser prompt
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const sortedSpatialTree = useMemo(() => {
    const tree: Record<string, { workAreas: Record<string, { rooms: Record<string, any[]> }> }> = {};

    milestones.forEach((ms: any) => {
      const lvl = ms.level?.trim() || "Unassigned Floor Levels";
      const area = ms.workArea?.trim() || "General Worksite Sector";
      const rm = ms.specificRoom?.trim() || "General Area Footprint";

      if (!tree[lvl]) tree[lvl] = { workAreas: {} };
      if (!tree[lvl].workAreas[area]) tree[lvl].workAreas[area] = { rooms: {} };
      if (!tree[lvl].workAreas[area].rooms[rm]) tree[lvl].workAreas[area].rooms[rm] = [];

      tree[lvl].workAreas[area].rooms[rm].push(ms);
    });

    const sortedLevels = Object.entries(tree).sort(([aName], [bName]) => sortLevels(aName, bName));

    return sortedLevels.map(([levelName, levelData]) => {
      const sortedWorkAreas = Object.entries(levelData.workAreas).sort(([aName], [bName]) => naturalCompare(aName, bName));

      const processedWorkAreas = sortedWorkAreas.map(([areaName, areaData]) => {
        const sortedRooms = Object.entries(areaData.rooms).sort(([aName], [bName]) => naturalCompare(aName, bName));
        return {
          areaName,
          rooms: sortedRooms.map(([roomName, roomMilestones]) => ({
            roomName,
            milestones: roomMilestones
          }))
        };
      });

      return {
        levelName,
        workAreas: processedWorkAreas
      };
    });
  }, [milestones]);

  // Fetch Dynamic Projects from Admin Portal
  useEffect(() => {
    const qProjects = query(collection(db, "admin_projects"));
    const unsubProjects = onSnapshot(qProjects, (snapshot) => {
      const projects = snapshot.docs.map(d => ({
        id: d.id,
        name: d.data().name || d.data().projectName || d.id,
        track: d.data().program || "Unknown Track",
        budget: d.data().budget || 0
      }));
      setAvailableProjects(projects);
      if (!selectedProject && projects.length > 0) setSelectedProject(projects[0].id);
    }, (error: Error) => console.error("Firestore admin_projects listener error:", error));
    return () => unsubProjects();
  }, [selectedProject]);

  // Fetch Workbench Data when Selected Project Changes
  useEffect(() => {
    if (!selectedProject) return;

    const fetchBaseline = async () => {
      const docSnap = await getDoc(doc(db, "project_baselines", selectedProject));
      if (docSnap.exists()) setBaselineData(docSnap.data());
      else setBaselineData(null);
    };
    
    const fetchWorkbenchState = async () => {
      const stateSnap = await getDoc(doc(db, "project_workbench_states", selectedProject));
      let initialMilestones = [];
      let initialDependencies = [];
      let initialEvm = { plannedValue: 0, earnedValue: 0, actualCost: 0 };
      if (stateSnap.exists()) {
        const data = stateSnap.data();
        initialMilestones = data.milestones || [];
        initialDependencies = data.dependencies || [];
        initialEvm = data.evm || { plannedValue: 0, earnedValue: 0, actualCost: 0 };
      } else {
        initialMilestones = [{ id: crypto.randomUUID(), type: "Construction", name: "Drywall Complete", baselineStart: "", baselineEnd: "", forecastStart: "", forecastEnd: "", status: "Planned", criticalPathStatus: "🟢 On Track", notes: "" }];
        initialDependencies = [];
        initialEvm = { plannedValue: 0, earnedValue: 0, actualCost: 0 };
      }
      setMilestones(initialMilestones);
      setDependencies(initialDependencies);
      setEvm(initialEvm);
      setInitialState(JSON.stringify({ milestones: initialMilestones, dependencies: initialDependencies, evm: initialEvm }));
    };

    fetchBaseline();
    fetchWorkbenchState();

    const unsubJournal = onSnapshot(query(collection(db, "project_journals", selectedProject, "entries"), orderBy("timestamp", "desc")), (snap) => setJournalLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))), (error) => console.error("Firestore project journal listener error:", error));
    const unsubReports = onSnapshot(query(collection(db, "project_status_reports", selectedProject, "biweekly_reports"), orderBy("timestamp", "desc")), (snap) => setStatusReports(snap.docs.map(d => ({ id: d.id, ...d.data() }))), (error) => console.error("Firestore project reports listener error:", error));
    
    const unsubEmails = onSnapshot(query(collection(db, "project_correspondence", selectedProject, "logs"), orderBy("timestamp", "desc")), (snap) => {
      const currentUser = auth.currentUser?.email || "Unknown PM";
      const allLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setEmailLogs(allLogs.filter((log: any) => log.loggedBy === currentUser));
    }, (error) => console.error("Firestore project correspondence listener error:", error));

    return () => { unsubJournal(); unsubReports(); unsubEmails(); };
  }, [selectedProject]);

  const costVariance = evm.earnedValue - evm.actualCost;
  const scheduleVariance = evm.earnedValue - evm.plannedValue;
  const cpi = evm.actualCost > 0 ? (evm.earnedValue / evm.actualCost).toFixed(2) : "0.00";
  const spi = evm.plannedValue > 0 ? (evm.earnedValue / evm.plannedValue).toFixed(2) : "0.00";
  const currentSpiNum = parseFloat(spi);

  const calculateBaselineDuration = (start: string, end: string) => durationDays(start, end);
  const calculateMilestoneVariance = (baselineEnd: string, forecastEnd: string) => varianceDays(baselineEnd, forecastEnd);
  const calculateEstimatedDuration = (baselineStart: string, baselineEnd: string) => {
    const baseDuration = calculateBaselineDuration(baselineStart, baselineEnd);
    if (baseDuration === null || baseDuration === 0) return baseDuration;
    if (currentSpiNum <= 0) return baseDuration; 
    return parseFloat((baseDuration / currentSpiNum).toFixed(1));
  };

  const hasCriticalPathBlocker = useMemo(() => milestones.some(m => m.criticalPathStatus === "🔴 Critical Path Blocked"), [milestones]);
  const activeConstructionDependenciesCount = dependencies.filter(d => d.type === "Trade" && d.status === "Active Block").length;
  
  const filteredEmails = useMemo(() => emailLogs.filter(log => 
    log.subject.toLowerCase().includes(emailSearch.toLowerCase()) ||
    log.content.toLowerCase().includes(emailSearch.toLowerCase()) ||
    log.sender.toLowerCase().includes(emailSearch.toLowerCase())
  ), [emailLogs, emailSearch]);

  const handleAutoGenerateReport = async () => {
    setIsGenerating(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Authentication required.");
      const response = await fetch('/api/generate-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          journalEntries: journalLogs,
          reportingPeriod: `${reportForm.periodStart} to ${reportForm.periodEnd}`
        })
      });

      const aiData = await response.json();
      if (aiData.projectSummaries && aiData.projectSummaries.length > 0) {
        const projectData = aiData.projectSummaries[0]; 
        setReportForm({
          ...reportForm,
          lookAhead: projectData.lookAhead,
          risks: projectData.risks,
          impact: projectData.impact,
          resolutionPlan: projectData.resolutionPlan,
          actionItems: projectData.actionItems.join('\n')
        });
        toast({ title: "AI Draft Complete", description: "Report populated from journal logs. Please review." });
      }
    } catch (error) {
      toast({ variant: "destructive", title: "AI Generation Error", description: "Ensure the API route is built." });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleLogEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmailLog.subject || !newEmailLog.content) return;
    try {
      await addDoc(collection(db, "project_correspondence", selectedProject, "logs"), { ...newEmailLog, loggedBy: auth.currentUser?.email || "Kendall Aaron", timestamp: new Date().toISOString() });
      setNewEmailLog({ subject: "", sender: "", content: "", systemTag: "General / Correspondence" });
      toast({ title: "Correspondence Audited" });
    } catch (err) { toast({ variant: "destructive", title: "Audit Error" }); }
  };

  const exportToCSV = () => {
    if (filteredEmails.length === 0) return;
    const headers = ["Timestamp", "Logged By", "Sender/Source", "Subject", "System Tag", "Content Summary"];
    const rows = filteredEmails.map(log => [new Date(log.timestamp).toLocaleString(), log.loggedBy, log.sender, log.subject, log.systemTag, log.content.replace(/"/g, '""')]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => `"${e.join('","')}"`)].join("\n");
    const link = document.createElement("a");
    link.href = encodeURI(csvContent);
    link.download = `Audit_Trail_${selectedProject}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const exportFieldObservationsCSV = async () => {
    try {
      const observationsCollectionRef = collection(db, "field_observations");
      const obsSnap = await getDocs(observationsCollectionRef);
      if (obsSnap.empty) {
        toast({ variant: "destructive", title: "Database Empty", description: "No observation records exist." });
        return;
      }
      
      const allObservations = obsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const headers = ["Report Number", "Project ID Context", "Project Scope / Name", "Program (Track & Stage)", "Site Conditions", "Observation Type", "Log Entry Narrative", "Worksite Location Summary", "Resolution Designation Type", "Resolution Status History"];

      const rows = allObservations.map((obs: any) => {
        const programTrackStage = `[${obs.program || "TDP"}] - ${obs.stage || "Construction"}`;
        const siteConditions = `Weather: ${obs.weather || "Clear"} | Exterior: ${obs.isExterior ? "Yes" : "No"}`;
        const locationSummary = `${obs.location || "General Site"} - Level ${obs.buildingLevel || "0"} (Sector ${obs.sectorId || "N/A"})`;
        const auditTrail = obs.resolutionHistory ? obs.resolutionHistory.map((h: any) => `[${h.operator || "PM"} ${new Date(h.timestamp).toLocaleDateString()}]: ${h.notes}`).join(" | ") : (obs.text || obs.description || "No triage updates compiled.");

        return [obs.reportNumber || legacyReportNumber(obs.id), obs.projectId || "Unassigned ID", obs.projectName || "Unnamed System Target", programTrackStage.replace(/"/g, '""'), siteConditions.replace(/"/g, '""'), obs.observationType || obs.type || "General", (obs.text || obs.description || "Narrative log context missing").replace(/"/g, '""'), locationSummary.replace(/"/g, '""'), obs.resolutionDesignation || "Unassigned", auditTrail.replace(/"/g, '""')];
      });

      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => `"${e.join('","')}"`)].join("\n");
      const link = document.createElement("a");
      link.href = encodeURI(csvContent);
      link.download = `Global_Field_Observations_Snapshot_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      toast({ title: "Global Export Complete", description: `Extracted ${allObservations.length} logs.` });
    } catch (err) {
      toast({ variant: "destructive", title: "Export Error" });
    }
  };

  const handleSaveWorkbenchState = async () => {
    setIsSavingState(true);
    try {
      const currentUser = auth.currentUser?.email || "Kendall Aaron";
      const timestamp = new Date().toISOString();
      const processedMilestones = milestones.map(m => ({ ...m, baselineDurationDays: calculateBaselineDuration(m.baselineStart, m.baselineEnd), estimatedDurationDays: calculateEstimatedDuration(m.baselineStart, m.baselineEnd), varianceDays: calculateMilestoneVariance(m.baselineEnd, m.forecastEnd) }));
      const macroCalculatedHealth = costVariance < 0 || hasCriticalPathBlocker || currentSpiNum < 1 ? "Critical Risk" : "On Track";

      const savePayload = { projectId: selectedProject, milestones: processedMilestones, dependencies, evm, statusHealthIndicator: macroCalculatedHealth, lastSavedBy: currentUser, lastSavedAt: timestamp };
      await setDoc(doc(db, "project_workbench_states", selectedProject), savePayload);
      await addDoc(collection(db, "project_workbench_states", selectedProject, "historical_snapshots"), { ...savePayload, snapshotTimestamp: timestamp });
      setInitialState(JSON.stringify({ milestones, dependencies, evm }));
      toast({ title: "Workbench Settings Saved" });
    } catch (err) {
      toast({ variant: "destructive", title: "Save Error" });
    } finally { setIsSavingState(false); }
  };

  const handleLockBaseline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!baselineForm.start || !baselineForm.end) return;
    try {
      await setDoc(doc(db, "project_baselines", selectedProject), { start: baselineForm.start, end: baselineForm.end, lockedBy: auth.currentUser?.email, lockedAt: new Date().toISOString() });
      setBaselineData({ start: baselineForm.start, end: baselineForm.end });
      toast({ title: "Master Baseline Locked" });
    } catch (err) { toast({ variant: "destructive", title: "Lock Failed" }); }
  };

  const handleCommitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const currentUser = auth.currentUser?.email || "Kendall Aaron";
      const timestamp = new Date().toISOString();
      const milestoneVariances = milestones.map(m => ({
        name: m.tradeMilestone || m.name || "Unnamed milestone",
        variance: calculateMilestoneVariance(m.baselineEnd || m.baselineEndDate, m.forecastEnd || m.forecastEndDate),
      })).filter((entry): entry is { name: string; variance: number } => entry.variance !== null);
      const criticalMilestone = milestoneVariances.reduce<{ name: string; variance: number } | null>((current, entry) =>
        !current || entry.variance > current.variance ? entry : current, null);
      const reportingPeriodString = `${reportForm.periodStart} to ${reportForm.periodEnd}`;

      await addDoc(collection(db, "project_status_reports", selectedProject, "biweekly_reports"), { ...reportForm, reportingPeriod: reportingPeriodString, evmMetrics: { plannedValue: evm.plannedValue, earnedValue: evm.earnedValue, actualCost: evm.actualCost, costVariance, scheduleVariance, cpi, spi }, milestonesSnapshot: milestones, dependenciesSnapshot: dependencies, loggedBy: currentUser, timestamp });
      await setDoc(doc(db, "portfolio_rollups", selectedProject), { projectId: selectedProject, projectName: activeProjectData.name, budgetAllocation: activeProjectData.budget, costVariance, scheduleVariance, cpi: parseFloat(cpi), spi: currentSpiNum, criticalMilestoneVarianceDays: criticalMilestone?.variance ?? null, criticalMilestoneName: criticalMilestone?.name || "", criticalBlockersCount: activeConstructionDependenciesCount, latestPeriod: reportingPeriodString, executiveSummaryLookAhead: reportForm.lookAhead, currentRisksText: reportForm.risks, mitigationPlanText: reportForm.resolutionPlan, lastSignOffBy: currentUser, lastSignOffAt: timestamp, statusHealthIndicator: costVariance < 0 || hasCriticalPathBlocker || currentSpiNum < 1 ? "Critical Risk" : "On Track" });

      await addDoc(collection(db, "status_reports"), {
        projectId: selectedProject,
        projectName: activeProjectData.name || selectedProject,
        reportPeriod: reportingPeriodString,
        periodEnd: reportForm.periodEnd,
        submittedBy: currentUser,
        cpi: parseFloat(cpi),
        spi: currentSpiNum,
        evmMetrics: { plannedValue: evm.plannedValue, earnedValue: evm.earnedValue, actualCost: evm.actualCost, costVariance, scheduleVariance, cpi: parseFloat(cpi), spi: currentSpiNum },
        statusHealth: costVariance < 0 || hasCriticalPathBlocker || currentSpiNum < 1 ? "Critical Risk" : "On Track",
        createdAt: timestamp,
        lookAhead: reportForm.lookAhead || "",
        risks: reportForm.risks || "",
        impact: reportForm.impact || "",
        resolutionPlan: reportForm.resolutionPlan || "",
        actionItems: reportForm.actionItems || ""
      });

      toast({ title: "Report Committed" });
      setReportForm({ periodStart: "", periodEnd: "", lookAhead: "", risks: "", impact: "", resolutionPlan: "", actionItems: "" });
      setIsReportModalOpen(false);
    } catch (err) { toast({ variant: "destructive", title: "Error" }); } finally { setIsSubmitting(false); }
  };

  const handleLogJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!journalEntry.trim()) return;
    try {
      await addDoc(collection(db, "project_journals", selectedProject, "entries"), { text: journalEntry, loggedBy: auth.currentUser?.email || "Kendall Aaron", timestamp: new Date().toISOString() });
      setJournalEntry("");
    } catch (err) { }
  };

  const handleAddMilestone = (type: "Construction" | "IT") => setMilestones([...milestones, { id: crypto.randomUUID(), type, name: "", baselineStart: "", baselineEnd: "", forecastStart: "", forecastEnd: "", status: "Planned", criticalPathStatus: "🟢 On Track", notes: "" }]);
  const updateDependency = (id: string, field: string, value: string) => setDependencies(dependencies.map(d => d.id === id ? { ...d, [field]: value } : d));
  const removeDependency = (id: string) => setDependencies(dependencies.filter(d => d.id !== id));
  const handleAddDependency = () => setDependencies([...dependencies, { id: crypto.randomUUID(), type: "Trade", targetEntity: "", tradeDivision: "", linkedMilestone: "", activityTask: "", status: "Active Block" }]);
  const handleDeleteMilestone = (id: string) => {
    setMilestones(milestones.filter(m => m.id !== id));
    setHasUnsavedChanges(true);
    setEditingMilestone(null);
    toast({ title: "Milestone Removed", description: "Click 'Save Workbench Settings' to persist changes." });
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
          {auth.currentUser?.email === "kendallaaron84@gmail.com" && (
            <Button onClick={() => setIsAdminMode(!isAdminMode)} variant={isAdminMode ? "destructive" : "outline"} className="h-10 text-xs font-bold gap-1.5 rounded-sm cursor-pointer">
              {isAdminMode ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
              {isAdminMode ? "Lock Baseline Edits" : "Admin Override Mode"}
            </Button>
          )}

          <div className="w-72">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 block">Active Project Target</label>
            <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} className="w-full border border-slate-300 rounded-sm text-sm p-2 shadow-sm bg-white h-10 focus:outline-none">
              {availableProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {hasUnsavedChanges && (
            <Badge className="bg-amber-100 border border-amber-300 text-amber-800 font-bold h-10 px-3 rounded-sm flex items-center gap-1.5 animate-pulse shrink-0">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> Unsaved Changes
            </Badge>
          )}

          <Button onClick={handleSaveWorkbenchState} disabled={isSavingState} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 rounded-sm px-4 flex items-center gap-1.5 cursor-pointer shadow-xs">
            <Save className="h-4 w-4" /> {isSavingState ? "Saving..." : "Save Workbench Settings"}
          </Button>

          <Button onClick={exportFieldObservationsCSV} variant="outline" className="border-slate-300 hover:bg-slate-50 text-slate-700 font-bold h-10 rounded-sm px-4 flex items-center gap-1.5 cursor-pointer shadow-xs">
            <Download className="h-4 w-4" /> Export Field Reports
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
            <div><span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Active Construction Trade Blocks</span><div className="text-xl font-black text-amber-700 font-mono mt-1">{activeConstructionDependenciesCount} Blocks</div></div>
            <Network className="h-5 w-5 text-amber-500" />
          </CardContent>
        </Card>
        <Card className={`border-l-4 bg-blue-50/10 shadow-xs rounded-sm ${currentSpiNum >= 1 ? "border-l-emerald-600" : "border-l-red-600"}`}>
          <CardContent className="p-4 flex justify-between items-center">
            <div><span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Schedule Performance Index</span><div className={`text-xl font-black font-mono mt-1 ${currentSpiNum >= 1 ? "text-emerald-600" : "text-red-600"}`}>SPI: {spi}</div></div>
            <TrendingUp className="h-5 w-5 text-slate-400" />
          </CardContent>
        </Card>
        <Card className={`border-l-4 shadow-xs rounded-sm ${hasCriticalPathBlocker ? "border-l-red-600 bg-red-50/20" : "border-l-emerald-600 bg-emerald-50/10"}`}>
          <CardContent className="p-4 flex justify-between items-center">
            <div><span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Critical Path Governance Mode</span><div className={`text-xl font-black mt-1 flex items-center gap-1.5 ${hasCriticalPathBlocker ? "text-red-700" : "text-emerald-700"}`}>{hasCriticalPathBlocker ? <><ShieldAlert className="h-5 w-5 animate-pulse text-red-600" /> OVERRIDE: CRITICAL BLOCK</> : <><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Nominal Path Conditions</>}</div></div>
          </CardContent>
        </Card>
      </div>

      {/* ROW 1: BASELINE LOGS & EVM */}
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

      {/* ROW 2: MILESTONE MANAGEMENT */}
      <Card className="border-slate-200 shadow-sm rounded-sm bg-white">
        <CardHeader 
          onClick={() => setIsMilestoneSectionCollapsed(!isMilestoneSectionCollapsed)}
          className="bg-slate-50 border-b py-3.5 flex flex-row items-center justify-between cursor-pointer hover:bg-slate-100/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-slate-400 font-bold font-mono text-sm">
              {isMilestoneSectionCollapsed ? "➕" : "➖"}
            </span>
            <div>
              <CardTitle className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-[#142E88]" /> Milestone Lifecycle & Earned Schedule Engine
              </CardTitle>
              <CardDescription className="text-xs">
                Click headers to collapse section. Currently mapping {milestones.length} operational line items.
              </CardDescription>
            </div>
          </div>
          {!isMilestoneSectionCollapsed && (
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              <Button onClick={() => handleAddMilestone("Construction")} variant="outline" size="sm" className="h-8 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200 cursor-pointer"><Plus className="h-3 w-3 mr-1" /> Add Const.</Button>
              <Button onClick={() => handleAddMilestone("IT")} variant="outline" size="sm" className="h-8 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200 cursor-pointer"><Plus className="h-3 w-3 mr-1" /> Add IT</Button>
            </div>
          )}
        </CardHeader>

        {!isMilestoneSectionCollapsed && (
          <CardContent className="p-4 space-y-4 bg-white">
            {(() => {
              if (sortedSpatialTree.length === 0) {
                return <div className="p-8 text-center text-slate-400 italic text-xs">No active structural work packages logged under this project.</div>;
              }

              return sortedSpatialTree.map(({ levelName, workAreas }) => (
                <div key={levelName} className="border border-blue-200 rounded-sm overflow-hidden shadow-xs bg-white">
                  
                  <div className="bg-[#EBF5FF] text-[#1E3A8A] font-sans font-black text-xs px-4 py-2.5 border-b border-blue-200 uppercase tracking-wide">
                    🏢 LEVEL LOCATION: {levelName}
                  </div>

                  <div className="p-3 space-y-3 bg-slate-50/30">
                    {workAreas.map(({ areaName, rooms }) => (
                      <div key={areaName} className="border border-emerald-200 rounded-xs bg-white overflow-hidden shadow-2xs">
                        
                        <div className="bg-[#E6F4EA] text-[#137333] font-sans font-bold text-[11px] px-3 py-2 border-b border-emerald-200">
                          🗺️ Functional Work Area: {areaName}
                        </div>

                        <div className="p-2.5 space-y-2.5">
                          {rooms.map(({ roomName, milestones: roomMilestones }) => (
                            <div key={roomName} className="border border-amber-200 rounded-xs overflow-hidden bg-white shadow-3xs">
                              
                              <div className="bg-[#FEF7E0] text-[#B06000] font-sans font-semibold text-[11px] px-3 py-1.5 border-b border-amber-200 flex justify-between items-center">
                                <span>📍 Coordinate Area / Room: {roomName}</span>
                                <Badge className="bg-amber-100 border border-amber-200/50 text-[9px] shadow-none text-[#B06000] font-mono font-bold">
                                  {roomMilestones.length} Tasks Active
                                </Badge>
                              </div>

                              <div className="overflow-x-auto bg-white">
                                <Table>
                                  <TableHeader className="bg-slate-50 border-b">
                                    <TableRow className="hover:bg-transparent">
                                      <TableHead className="text-[10px] font-black uppercase tracking-wider text-slate-500 py-2 pl-4">Delivery Track</TableHead>
                                      <TableHead className="text-[10px] font-black uppercase tracking-wider text-slate-500 py-2">Milestone Target Name</TableHead>
                                      <TableHead className="text-[10px] font-black uppercase tracking-wider text-slate-500 py-2">Baseline Range</TableHead>
                                      <TableHead className="text-[10px] font-black uppercase tracking-wider text-slate-500 py-2">Forecast Window</TableHead>
                                      <TableHead className="text-[10px] font-black uppercase tracking-wider text-slate-500 py-2 text-center">Variance</TableHead>
                                      <TableHead className="text-[10px] font-black uppercase tracking-wider text-slate-500 py-2">Status</TableHead>
                                      <TableHead className="text-[10px] font-black uppercase tracking-wider text-slate-500 py-2 text-right pr-4">Actions</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {roomMilestones.map((ms: any) => {
                                      const startVar = calculateMilestoneVariance(ms.baselineStart, ms.forecastStart);
                                      const endVar = calculateMilestoneVariance(ms.baselineEnd, ms.forecastEnd);
                                      return (
                                        <TableRow key={ms.id} className="hover:bg-slate-50/30 border-b border-slate-100 last:border-none">
                                          
                                          <TableCell className="py-2 pl-4">
                                            <span className={`px-2 py-0.5 rounded-xs text-[9px] font-mono font-bold border ${
                                              ms.deliveryVehicle === 'IT_DIRECT' 
                                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                                                : 'bg-blue-50 border-blue-200 text-blue-700'
                                            }`}>
                                              {ms.deliveryVehicle || (ms.type === 'IT' ? 'IT_DIRECT' : 'CMAR')}
                                            </span>
                                          </TableCell>
                                          
                                          <TableCell className="py-2 font-medium text-slate-800 text-xs">
                                            {ms.tradeMilestone || ms.name}
                                          </TableCell>
                                          
                                          <TableCell className="py-2 text-[10px] font-mono text-slate-500 leading-tight">
                                            <div>S: {ms.baselineStart || ms.baselineStartDate || '--'}</div>
                                            <div>E: {ms.baselineEnd || ms.baselineEndDate || '--'}</div>
                                          </TableCell>
                                          
                                          <TableCell className="py-2 text-[10px] font-mono text-slate-800 font-bold leading-tight">
                                            <div>S: {ms.forecastStart || ms.forecastStartDate || '--'}</div>
                                            <div>E: {ms.forecastEnd || ms.forecastEndDate || '--'}</div>
                                          </TableCell>
                                          
                                          <TableCell className="py-2 text-center text-[10px] font-mono font-bold leading-tight">
                                            <div className={startVar !== null && startVar > 0 ? 'text-red-600' : 'text-emerald-600'}>{startVar === null ? 'N/A' : startVar > 0 ? `+${startVar}d` : `${startVar}d`}</div>
                                            <div className={endVar !== null && endVar > 0 ? 'text-red-600' : 'text-emerald-600'}>{endVar === null ? 'N/A' : endVar > 0 ? `+${endVar}d` : `${endVar}d`}</div>
                                          </TableCell>
                                          
                                          <TableCell className="py-2">
                                            <Badge variant="outline" className={`text-[9px] font-sans font-bold shadow-none ${
                                              ms.status === 'Complete' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                              ms.status === 'Blocked' || ms.status === 'Active Block' ? 'bg-red-50 text-red-700 border-red-200 animate-pulse' :
                                              ms.status === 'Planned' ? 'bg-slate-100 text-slate-600 border-slate-300' :
                                              'bg-slate-50 text-slate-700 border-slate-200'
                                            }`}>
                                              {ms.status}
                                            </Badge>
                                          </TableCell>
                                          
                                          <TableCell className="py-2 text-right pr-4">
                                            <div className="flex items-center justify-end gap-2">
                                              <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                onClick={() => {
                                                  setEditingMilestone({
                                                    id: ms.id,
                                                    level: levelName,
                                                    workArea: areaName,
                                                    specificRoom: roomName,
                                                    tradeMilestone: ms.tradeMilestone || ms.name,
                                                    baselineStartDate: ms.baselineStart || ms.baselineStartDate || "",
                                                    baselineEndDate: ms.baselineEnd || ms.baselineEndDate || "",
                                                    forecastStartDate: ms.forecastStart || ms.forecastStartDate || "",
                                                    forecastEndDate: ms.forecastEnd || ms.forecastEndDate || "",
                                                    status: ms.status === 'Blocked' ? 'Active Block' : (ms.status || 'Planned'),
                                                    deliveryVehicle: ms.deliveryVehicle || (ms.type === 'IT' ? 'IT_DIRECT' : 'CMAR')
                                                  });
                                                }}
                                                className="h-7 text-[#142E88] text-[10px] font-bold hover:bg-blue-50 cursor-pointer px-2"
                                              >
                                                <Plus className="h-3 w-3 mr-1" /> Open Update Modal
                                              </Button>
                                              <button
                                                onClick={() => handleDeleteMilestone(ms.id)}
                                                title="Delete Task / Milestone"
                                                className="p-1 hover:bg-red-50 rounded transition-colors cursor-pointer"
                                              >
                                                <Trash2 className="h-4 w-4 text-red-500 hover:text-red-700 cursor-pointer" />
                                              </button>
                                            </div>
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()}
          </CardContent>
        )}
      </Card>

      {/* ROW 3: DEPENDENCY TRACKER & JOURNAL */}
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
                      <select 
                        value={d.type || "Trade"} 
                        onChange={e => { 
                          updateDependency(d.id, "type", e.target.value); 
                          if(e.target.value === 'Cross-Project') updateDependency(d.id, "tradeDivision", ""); 
                        }} 
                        className={`h-8 border rounded-sm text-[10px] px-1 w-24 font-bold ${d.type === 'Cross-Project' ? 'bg-purple-50 text-purple-800 border-purple-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}
                      >
                        <option value="Cross-Project">Cross-Project</option>
                        <option value="Trade">Trade Base</option>
                      </select>
                    </TableCell>
                    <TableCell><Input value={d.targetEntity} onChange={e => updateDependency(d.id, "targetEntity", e.target.value)} placeholder={d.type === 'Cross-Project' ? "e.g. Terminal C" : "e.g. Mechanical Contractor"} className="h-8 text-xs bg-white" /></TableCell>
                    <TableCell>{d.type === "Trade" ? (<select value={d.tradeDivision || ""} onChange={e => updateDependency(d.id, "tradeDivision", e.target.value)} className="h-8 border border-slate-200 rounded-sm text-[10px] px-1.5 w-full bg-white font-semibold text-slate-700"><option value="">Select Division...</option>{TRADE_DIVISIONS.map(div => <option key={div.code} value={div.code}>{div.code} - {div.name}</option>)}</select>) : (<span className="text-[10px] text-slate-400 font-mono italic pl-2">N/A (Cross-Proj)</span>)}</TableCell>
                    <TableCell><Input value={d.activityTask} onChange={e => updateDependency(d.id, "activityTask", e.target.value)} placeholder="e.g. Cable Pulling" className="h-8 text-xs bg-white" /></TableCell>
                    <TableCell><Input value={d.linkedMilestone} onChange={e => updateDependency(d.id, "linkedMilestone", e.target.value)} placeholder="Milestone blocked..." className="h-8 text-xs bg-white" /></TableCell>
                    <TableCell><select value={d.status} onChange={e => updateDependency(d.id, "status", e.target.value)} className={`h-8 border border-slate-200 rounded-sm text-[10px] px-1 font-bold w-full ${d.status === 'Active Block' ? 'text-red-600 bg-red-50' : 'text-emerald-600 bg-white'}`}><option value="Active Block">Active Block</option><option value="Resolved">Resolved</option><option value="Monitoring">Monitoring</option></select></TableCell>
                    <TableCell><button onClick={() => removeDependency(d.id)} className="text-red-400 hover:text-red-600 p-1 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

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

      {/* ROW 4: CORRESPONDENCE LEDGER */}
      <Card className="border-slate-200 shadow-sm rounded-sm bg-white col-span-1 lg:col-span-2">
        <div className="bg-slate-50/80 px-5 py-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2"><Network className="h-4 w-4 text-[#142E88]" /><h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">PM Correspondence Ledger & Audit Trail</h2></div>
          <Button onClick={exportToCSV} disabled={filteredEmails.length === 0} size="sm" variant="outline" className="h-8 text-xs font-bold gap-1 cursor-pointer border-slate-300"><Download className="h-3.5 w-3.5" /> Export Audit Records (.CSV)</Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[380px_1fr] divide-y md:divide-y-0 md:divide-x divide-slate-100 min-h-[450px]">
          <form onSubmit={handleLogEmail} className="p-5 space-y-4 bg-slate-50/20">
            <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Audit Tag Category</label><select value={newEmailLog.systemTag} onChange={e => setNewEmailLog({...newEmailLog, systemTag: e.target.value})} className="w-full border border-slate-300 rounded-sm text-xs p-2 bg-white h-9 focus:outline-none font-medium"><option value="General / Correspondence">General / Correspondence</option><option value="Submittal / Variance Impact">Submittal / Variance Impact</option><option value="RFI Source Track">RFI Source Track</option><option value="Scope Change Directive">Scope Change Directive</option></select></div>
            <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Sender / From</label><Input placeholder="e.g. Architect, Electrical Lead, Vendor" value={newEmailLog.sender} onChange={e => setNewEmailLog({...newEmailLog, sender: e.target.value})} className="h-9 text-xs bg-white" required /></div>
            <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Email Subject Header</label><Input placeholder="e.g. LAN Submittal Quantity Discrepancy" value={newEmailLog.subject} onChange={e => setNewEmailLog({...newEmailLog, subject: e.target.value})} className="h-9 text-xs bg-white font-semibold" required /></div>
            <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Crucial Exchange Body Content</label><Textarea placeholder="Paste the exact key sentences or complete thread exchange details here..." value={newEmailLog.content} onChange={e => setNewEmailLog({...newEmailLog, content: e.target.value})} className="min-h-[140px] text-xs resize-none bg-white font-mono" required /></div>
            <Button type="submit" className="w-full bg-[#142E88] hover:bg-[#2b27b5] text-white font-bold h-9 text-xs rounded-sm flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"><Save className="h-3.5 w-3.5" /> Log Exchange to Secure History</Button>
          </form>
          <div className="flex flex-col bg-white">
            <div className="p-3 border-b bg-slate-50/50 flex items-center gap-2"><Search className="h-4 w-4 text-slate-400 shrink-0" /><Input placeholder="Filter historical threads by topic, text keyword, or contact..." value={emailSearch} onChange={e => setEmailSearch(e.target.value)} className="h-8 text-xs bg-white shadow-none" /></div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[450px]">
              {filteredEmails.length === 0 ? <div className="text-center text-slate-400 text-xs italic py-12">No correspondence logs matching search criteria.</div> : (
                filteredEmails.map((log) => (
                  <div key={log.id} className="border border-slate-200 rounded-sm bg-white p-3 shadow-xs space-y-2 hover:border-[#142E88]/40 transition-colors">
                    <div className="flex justify-between items-start border-b border-slate-100 pb-1.5"><div><Badge variant="outline" className="text-[9px] font-bold bg-slate-50 text-slate-700 rounded-sm uppercase tracking-wide px-1.5 py-0">{log.systemTag}</Badge><h3 className="text-xs font-bold text-slate-900 mt-1">{log.subject}</h3></div><div className="text-right text-[9px] font-bold text-slate-400 font-mono"><div>{new Date(log.timestamp).toLocaleDateString()}</div><div>{new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div></div></div>
                    <p className="text-xs text-slate-600 bg-slate-50/50 p-2 border border-dashed rounded-xs whitespace-pre-wrap leading-relaxed font-mono">{log.content}</p>
                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-semibold pt-0.5"><span>From: <strong className="text-slate-700">{log.sender}</strong></span><span>Logged By: <strong className="text-slate-500">{log.loggedBy.split('@')[0]}</strong></span></div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* HISTORICAL REPORTS LEDGER */}
      <Card className="border-slate-200 shadow-sm rounded-sm bg-white mt-6">
        <CardHeader className="bg-slate-50 border-b py-4"><CardTitle className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2"><FileText className="h-4 w-4 text-slate-500" /> Historical Bi-Weekly Status Reports</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {statusReports.length === 0 ? <div className="p-8 text-center text-slate-400 text-sm italic">No status reports have been generated yet.</div> : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent"><TableHead className="text-xs font-bold text-slate-700">Date Logged</TableHead><TableHead className="text-xs font-bold text-slate-700">Reporting Period</TableHead><TableHead className="text-xs font-bold text-slate-700">Submitted By</TableHead><TableHead className="text-xs font-bold text-slate-700">Performance (SPI / CPI)</TableHead><TableHead className="text-xs font-bold text-right text-slate-700">Action</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {statusReports.map(report => (
                  <TableRow key={report.id} className="hover:bg-slate-50/50 transition-colors">
                    <TableCell className="text-xs font-mono font-medium text-slate-700">{new Date(report.timestamp).toLocaleDateString()}</TableCell><TableCell className="text-xs font-semibold text-[#142E88]">{report.reportingPeriod}</TableCell><TableCell className="text-xs text-slate-500">{report.loggedBy}</TableCell>
                    <TableCell className="text-xs font-mono font-bold"><span className={parseFloat(report.evmMetrics?.spi) < 1 ? 'text-red-600' : 'text-emerald-600'}>SPI: {report.evmMetrics?.spi || 'N/A'}</span><span className="text-slate-300 mx-2">|</span><span className={parseFloat(report.evmMetrics?.cpi) < 1 ? 'text-red-600' : 'text-emerald-600'}>CPI: {report.evmMetrics?.cpi || 'N/A'}</span></TableCell>
                    <TableCell className="text-right"><Button variant="ghost" size="sm" className="text-xs font-bold text-[#142E88] h-8 cursor-pointer" onClick={() => setViewingSnapshot(report)}>View Snapshot</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* DRAFT REPORT MODAL WITH AI BUTTON */}
      {isReportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-[#142E88] text-white rounded-t-lg">
              <div className="flex items-center gap-2"><FileText className="h-5 w-5 text-emerald-400" /><div><h2 className="text-sm font-bold uppercase tracking-widest">Draft Bi-Weekly Status Report</h2></div></div>
              <button onClick={() => setIsReportModalOpen(false)} className="text-slate-300 hover:text-white transition-colors p-1 cursor-pointer"><X className="h-5 w-5" /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex justify-end mb-4">
                 <Button type="button" onClick={handleAutoGenerateReport} disabled={isGenerating || journalLogs.length === 0} className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-8 gap-1.5 cursor-pointer rounded-sm">
                   <Sparkles className="h-3.5 w-3.5" />
                   {isGenerating ? "Analyzing Journals..." : "Auto-Draft"}
                 </Button>
              </div>

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
                <div><label className="block text-xs font-bold text-slate-700 mb-1">Resolution Plan</label><Textarea placeholder="Describe specific mitigation..." value={reportForm.resolutionPlan} maxLength={500} className="text-xs rounded-sm resize-none bg-white" rows={3} required /></div>
                <div><label className="block text-xs font-bold text-slate-700 mb-1">Action Items Required</label><Textarea placeholder="List outstanding decisions..." value={reportForm.actionItems} className="text-xs rounded-sm resize-none bg-white" rows={2} /></div>
              </form>
            </div>
            <div className="p-4 border-t bg-slate-50 flex justify-end gap-3 rounded-b-lg">
              <Button type="button" onClick={() => setIsReportModalOpen(false)} variant="outline" className="text-slate-600 text-xs font-bold cursor-pointer">Cancel</Button>
              <Button form="biweekly-form" type="submit" disabled={isSubmitting} className="bg-[#142E88] hover:bg-[#2b27b5] text-white font-bold h-9 rounded-sm flex items-center justify-center gap-2 cursor-pointer">Save Bi-Weekly Report</Button>
            </div>
          </div>
        </div>
      )}

      {/* 🆕 HIGH-CONTRAST CONTEXTUAL EDIT PANEL MODAL WIDGET (BOUND INDEPENDENTLY TO PREVENT SPLIT COLLISIONS) */}
      {editingMilestone && (
        <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-md shadow-2xl w-full max-w-xl flex flex-col relative border border-slate-200">
            
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between rounded-t-md">
              <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-[#1EA7F4]" /> Contextual Trade Update Panel
              </h3>
              <button onClick={() => setEditingMilestone(null)} className="text-slate-400 hover:text-white cursor-pointer"><X className="h-5 w-5" /></button>
            </div>

            <div className="p-6 space-y-5 bg-white max-h-[75vh] overflow-y-auto">
              
              <div className="space-y-3">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider font-mono block">1. Spatial Hierarchy Tags</span>
                <div className="space-y-2.5">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-blue-700 uppercase">Structural Floor Level</label>
                    <input type="text" value={editingMilestone.level} onChange={(e) => setEditingMilestone({...editingMilestone, level: e.target.value})} className="w-full text-xs rounded border border-blue-200 bg-blue-50/10 p-2 text-slate-900 font-medium focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-emerald-700 uppercase">Programmatic Work Area Footprint</label>
                    <input type="text" value={editingMilestone.workArea} onChange={(e) => setEditingMilestone({...editingMilestone, workArea: e.target.value})} className="w-full text-xs rounded border border-emerald-200 bg-emerald-50/10 p-2 text-slate-900 font-medium focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-amber-700 uppercase">Granular Room / Identity Context</label>
                    <input type="text" value={editingMilestone.specificRoom} onChange={(e) => setEditingMilestone({...editingMilestone, specificRoom: e.target.value})} className="w-full text-xs rounded border border-amber-200 bg-amber-50/10 p-2 text-slate-900 font-medium focus:outline-none" />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase block font-mono">Milestone Target Name</label>
                <input type="text" value={editingMilestone.tradeMilestone} onChange={(e) => setEditingMilestone({...editingMilestone, tradeMilestone: e.target.value})} className="w-full text-xs rounded border p-2 bg-slate-50 text-slate-900 font-semibold focus:outline-none" />
              </div>

              <div className="space-y-3 border-t pt-4">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider font-mono block">2. Schedule Horizon Controls</span>
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded border border-slate-100">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase">Baseline Start</label>
                    <input type="date" value={editingMilestone.baselineStartDate} onChange={(e) => setEditingMilestone({...editingMilestone, baselineStartDate: e.target.value})} className="w-full text-xs rounded border p-1.5 bg-white font-mono" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase">Baseline Finish</label>
                    <input type="date" value={editingMilestone.baselineEndDate} onChange={(e) => setEditingMilestone({...editingMilestone, baselineEndDate: e.target.value})} className="w-full text-xs rounded border p-1.5 bg-white font-mono" />
                  </div>
                  <div className="space-y-1 mt-1">
                    <label className="text-[9px] font-black text-[#142E88] uppercase">Forecast Start</label>
                    <input type="date" value={editingMilestone.forecastStartDate} onChange={(e) => setEditingMilestone({...editingMilestone, forecastStartDate: e.target.value})} className="w-full text-xs rounded border border-blue-200 p-1.5 bg-white font-mono font-bold" />
                  </div>
                  <div className="space-y-1 mt-1">
                    <label className="text-[9px] font-black text-[#142E88] uppercase">Forecast Finish</label>
                    <input type="date" value={editingMilestone.forecastEndDate} onChange={(e) => setEditingMilestone({...editingMilestone, forecastEndDate: e.target.value})} className="w-full text-xs rounded border border-blue-200 p-1.5 bg-white font-mono font-bold" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t pt-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-500 font-mono">Execution Status</label>
                  <select value={editingMilestone.status} onChange={(e) => setEditingMilestone({...editingMilestone, status: e.target.value})} className="w-full text-xs rounded border p-2 bg-white text-slate-900 font-medium cursor-pointer">
                    <option value="Planned">📅 Planned</option>
                    <option value="In Progress">⏳ In Progress</option>
                    <option value="Active Block">🚨 Active Block</option>
                    <option value="Complete">🟢 Complete</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-500 font-mono">Delivery Track (Procurement)</label>
                  <select value={editingMilestone.deliveryVehicle} onChange={(e) => setEditingMilestone({...editingMilestone, deliveryVehicle: e.target.value})} className={`w-full text-xs rounded border p-2 bg-white font-black transition-all cursor-pointer ${editingMilestone.deliveryVehicle === 'IT_DIRECT' ? 'border-emerald-300 text-emerald-700 bg-emerald-50/20' : 'border-blue-300 text-blue-700 bg-blue-50/20'}`}>
                    <option value="CMAR">🏢 CMAR Scope</option>
                    <option value="IT_DIRECT">⚡ IT_DIRECT Scope</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 px-5 py-3 border-t flex justify-between items-center rounded-b-md">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleDeleteMilestone(editingMilestone.id)} 
                className="text-xs font-bold text-red-600 hover:text-red-700 border-red-200 hover:border-red-300 hover:bg-red-50 bg-white cursor-pointer flex items-center gap-1"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete Task / Milestone
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditingMilestone(null)} className="text-xs font-bold cursor-pointer bg-white">Cancel</Button>
                <Button size="sm" onClick={() => {
                  setMilestones(milestones.map(m => m.id === editingMilestone.id ? {
                    ...m,
                    name: editingMilestone.tradeMilestone,
                    tradeMilestone: editingMilestone.tradeMilestone,
                    level: editingMilestone.level,
                    workArea: editingMilestone.workArea,
                    specificRoom: editingMilestone.specificRoom,
                    baselineStart: editingMilestone.baselineStartDate,
                    baselineEnd: editingMilestone.baselineEndDate,
                    forecastStart: editingMilestone.forecastStartDate,
                    forecastEnd: editingMilestone.forecastEndDate,
                    status: editingMilestone.status === 'Active Block' ? 'Blocked' : editingMilestone.status,
                    deliveryVehicle: editingMilestone.deliveryVehicle,
                    type: editingMilestone.deliveryVehicle === 'IT_DIRECT' ? 'IT' : 'Construction'
                  } : m));
                  setEditingMilestone(null);
                  toast({ title: "Milestone State Staged", description: "Click 'Save Workbench Settings' at the top to sync down to Firestore." });
                }} className="bg-[#142E88] hover:bg-blue-800 text-white text-xs font-bold px-4 cursor-pointer">
                  Commit Changes
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HISTORICAL SNAPSHOT READ-ONLY MODAL */}
      {viewingSnapshot && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-md shadow-2xl w-full max-w-4xl flex flex-col relative overflow-hidden">
            <div className="bg-slate-800 text-white px-5 py-3 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                <History className="h-4 w-4 text-slate-400" /> Historical Snapshot: {viewingSnapshot.projectId}
              </h3>
              <button onClick={() => setViewingSnapshot(null)} className="text-slate-400 hover:text-white cursor-pointer transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto bg-slate-50/50">
              <div className="grid grid-cols-4 gap-4 pb-4 border-b border-slate-200 bg-white p-4 rounded-sm shadow-xs">
                <div><span className="block text-[10px] font-bold text-slate-500 uppercase">Reporting Period</span><span className="text-sm font-semibold text-[#142E88]">{viewingSnapshot.reportingPeriod}</span></div>
                <div><span className="block text-[10px] font-bold text-slate-500 uppercase">Submitted By</span><span className="text-sm font-semibold text-slate-800">{viewingSnapshot.loggedBy?.split('@')[0]}</span></div>
                <div><span className="block text-[10px] font-bold text-slate-500 uppercase">Date Logged</span><span className="text-sm font-mono font-bold text-slate-800">{new Date(viewingSnapshot.timestamp).toLocaleDateString()}</span></div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-500 uppercase">EVM Performance</span>
                  <div className="text-sm font-mono font-bold">
                    <span className={parseFloat(viewingSnapshot.evmMetrics?.spi) < 1 ? 'text-red-600' : 'text-emerald-600'}>SPI: {viewingSnapshot.evmMetrics?.spi || 'N/A'}</span>
                    <span className="mx-2 text-slate-300">|</span>
                    <span className={parseFloat(viewingSnapshot.evmMetrics?.cpi) < 1 ? 'text-red-600' : 'text-emerald-600'}>CPI: {viewingSnapshot.evmMetrics?.cpi || 'N/A'}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white p-5 rounded-sm border border-slate-200 shadow-xs space-y-6">
                <div>
                  <span className="block text-xs font-bold text-slate-800 mb-2 border-b pb-1">3-Week Look Ahead</span>
                  <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">{viewingSnapshot.lookAhead || "No data provided."}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-red-50/30 p-3 rounded-sm border border-red-100">
                    <span className="block text-xs font-bold text-red-700 mb-2 border-b border-red-200 pb-1 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Identified Risks</span>
                    <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">{viewingSnapshot.risks || "No data provided."}</p>
                  </div>
                  <div className="bg-amber-50/30 p-3 rounded-sm border border-amber-100">
                    <span className="block text-xs font-bold text-amber-700 mb-2 border-b border-amber-200 pb-1 flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" /> Schedule/Financial Impact</span>
                    <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">{viewingSnapshot.impact || "No data provided."}</p>
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-bold text-slate-800 mb-2 border-b pb-1 flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Resolution Plan</span>
                  <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">{viewingSnapshot.resolutionPlan || "No data provided."}</p>
                </div>

                <div>
                  <span className="block text-xs font-bold text-slate-800 mb-2 border-b pb-1 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-[#142E88]" /> Action Items Required</span>
                  <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">{viewingSnapshot.resolutionPlan || "No action items requested."}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
