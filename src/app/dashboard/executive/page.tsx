// File: src/app/dashboard/executive/page.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Wallet, AlertTriangle, Activity, TrendingUp, ChevronRight, ChevronDown, CheckCircle2, Clock, Send, FileText, X, Printer, GitMerge, History, ChevronLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase"; 
import { collection, collectionGroup, onSnapshot, query, orderBy } from "firebase/firestore";
import { DynamicPortfolioTimeline } from "@/components/dashboard/DynamicPortfolioTimeline";
import { ActiveThreatRiskRegister } from "@/components/dashboard/ActiveThreatRiskRegister";
import { LiveProjectTelemetryTable } from "@/components/dashboard/LiveProjectTelemetryTable";
import type { Project, RAIDItem, RollupState, StatusReport } from "@/types/portfolio";
import { extractReportingPeriodEnd, normalizeDate, varianceDays } from "@/lib/date-utils";
import { addChronologicalTimestamps, buildSparseEvmSeries, calculateEvm, resolveReportingCutoff } from "@/lib/evm-utils";
import { createProjectNameMap, RAID_OWNERSHIP_COLORS, resolveProjectName, resolveRaidOwnershipState } from "@/lib/raid-display-utils";

// Definitive Risk Status Colors System
const STATUS_COLORS: Record<string, string> = RAID_OWNERSHIP_COLORS;

const TABLE_STATUS_FILTERS = ["ALL", "In Progress", "Planned", "Complete", "Active Block", "Monitoring"] as const;
type TableStatusFilter = typeof TABLE_STATUS_FILTERS[number];

const formatTimestamp = (ts: any): string => {
  return normalizeDate(ts)?.toLocaleDateString() || "N/A";
};

const getEvmColorClass = (val: any) => {
  if (val === null || val === undefined || val === "" || val === "N/A") return 'text-slate-500';
  const parsed = parseFloat(val);
  if (isNaN(parsed)) return 'text-slate-500';
  return parsed < 1 ? 'text-red-600 font-bold' : 'text-emerald-600 font-bold';
};

const formatEvmMetric = (value: unknown) => typeof value === "number" ? value.toFixed(2) : String(value || "N/A");
const formatChartDate = (value: unknown) => {
  const date = new Date(Number(value));
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : "N/A";
};

export default function AviationExecutiveControlRoom() {
  const { toast } = useToast();
  const [activeProgram, setActiveProgram] = useState<"ALL" | "TDP" | "CIP">("ALL");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [isTreeExpanded, setIsTreeExpanded] = useState(true);
  
  // Report Generation States
  const [isGenerating, setIsGenerating] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [generatedReportData, setGeneratedReportData] = useState<any>(null);
  const [viewingSnapshot, setViewingSnapshot] = useState<StatusReport | null>(null);
  const [severitySelection, setSeveritySelection] = useState<string>("ALL");
  const [milestoneStatusFilter, setMilestoneStatusFilter] = useState<TableStatusFilter>("ALL");
  const [dependencyStatusFilter, setDependencyStatusFilter] = useState<TableStatusFilter>("ALL");

  // Database States
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [criticalBlockers, setCriticalBlockers] = useState<RAIDItem[]>([]);
  const [rollups, setRollups] = useState<RollupState[]>([]);
  const [workbenchStates, setWorkbenchStates] = useState<RollupState[]>([]);
  const [raidItems, setRaidItems] = useState<RAIDItem[]>([]);
  const projectNames = useMemo(() => createProjectNameMap(allProjects), [allProjects]);
  
  // 📆 ENHANCEMENT 1: CALENDAR WINDOW INITIALIZATION ENGINE
  const [calendarBounds, setCalendarBounds] = useState(() => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0-indexed
    
    // Determine the precise calendar start window of the current quarter
    let startQuarterMonth = 0;
    if (currentMonth >= 3 && currentMonth <= 5) startQuarterMonth = 3;
    else if (currentMonth >= 6 && currentMonth <= 8) startQuarterMonth = 6;
    else if (currentMonth >= 9 && currentMonth <= 11) startQuarterMonth = 9;
    
    const startObj = new Date(currentYear, startQuarterMonth, 1);
    
    // Default dynamic view boundary limit: Current Quarter + 2 extended quarters (9 months absolute offset)
    const endObj = new Date(startObj.getTime());
    endObj.setMonth(endObj.getMonth() + 9);
    endObj.setDate(endObj.getDate() - 1); // Clamp to final day of the range
    
    return {
      startDateStr: startObj.toISOString().split('T')[0],
      endDateStr: endObj.toISOString().split('T')[0]
    };
  });
  
  // Global Historical Reports State
  const [globalReports, setGlobalReports] = useState<StatusReport[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  useEffect(() => {
    const unsubProjects = onSnapshot(collection(db, "admin_projects"), (snapshot) => {
      setAllProjects(snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Project[]);
    }, (error) => console.error("Firestore admin_projects listener error:", error));
    const unsubObs = onSnapshot(collection(db, "field_observations"), (snapshot) => {
      setCriticalBlockers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => console.error("Firestore field_observations listener error:", error));
    const qRollups = query(collection(db, "portfolio_rollups"), orderBy("projectName", "asc"));
    const unsubRollups = onSnapshot(qRollups, (snapshot) => {
      setRollups(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => console.error("Firestore portfolio_rollups listener error:", error));
    const qGlobalReports = query(collection(db, "status_reports"), orderBy("createdAt", "desc"));
    const unsubGlobalReports = onSnapshot(qGlobalReports, (snapshot) => {
      setGlobalReports(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => console.error("Firestore status_reports listener error:", error));
    const unsubWorkbench = onSnapshot(collection(db, "project_workbench_states"), (snapshot) => {
      setWorkbenchStates(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => console.error("Firestore project_workbench_states listener error:", error));
    const unsubRaid = onSnapshot(collection(db, "raid_matrix"), (snapshot) => {
      setRaidItems(snapshot.docs.map(d => ({ id: d.id, ...d.data() })).filter((item: any) => item.mergeStatus !== "MERGED"));
    }, (error) => console.error("Firestore raid_matrix listener error:", error));

    return () => { 
      unsubProjects(); 
      unsubObs(); 
      unsubRollups(); 
      unsubGlobalReports(); 
      unsubWorkbench(); 
      unsubRaid(); 
    };
  }, []);

  // 1. CORE FILTER LOGIC
  useEffect(() => {
    let list = [...allProjects];
    if (activeProgram !== "ALL") list = list.filter(p => p.program === activeProgram);
    if (selectedProjectIds.length > 0) list = list.filter(p => selectedProjectIds.includes(p.id));
    setFilteredProjects(list);
    setCurrentPage(1); 
  }, [allProjects, activeProgram, selectedProjectIds]);

  const toggleProjectSelection = (id: string) => {
    setSelectedProjectIds(prev => prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]);
  };

  // 🟢 2. FILTER DATA STREAMS WITH LIVE FALLBACK CONSTRAINTS
  const activeProjectIds = useMemo(() => {
    if (activeProgram === "ALL" && selectedProjectIds.length === 0) return allProjects.map(p => p.id);
    return filteredProjects.map(p => p.id);
  }, [filteredProjects, allProjects, activeProgram, selectedProjectIds]);

  const calculateVarianceDays = varianceDays;

  const filteredRollups = useMemo(() => {
    return filteredProjects.map(project => {
      const wState = workbenchStates.find(s => s.id === project.id || s.projectId === project.id);
      const rollupDoc = rollups.find(r => r.id === project.id);
      
      const currentRisksText = rollupDoc?.currentRisksText || "";
      const mitigationPlanText = rollupDoc?.mitigationPlanText || "Pending Review";
      const projectReports = globalReports.filter(report => report.projectId === project.id);
      
      if (wState) {
        const evm = calculateEvm(wState.evm || {});
        const { plannedValue, earnedValue, actualCost, costVariance, scheduleVariance } = evm;
        const cpi = evm.cpi ?? 0;
        const spi = evm.spi ?? 0;
        const reportingCutoff = resolveReportingCutoff(projectReports, wState.lastSavedAt);
        
        const criticalBlockersCount = (wState.dependencies || []).filter((d: any) => d.status === "Active Block").length;
        
        const criticalMilestone = (wState.milestones || [])
          .map((m: any) => ({
            name: m.tradeMilestone || m.name || "Unnamed milestone",
            variance: calculateVarianceDays(m.baselineEnd || m.baselineEndDate, m.forecastEnd || m.forecastEndDate),
          }))
          .filter((entry: any) => entry.variance !== null)
          .reduce((current: any, entry: any) => !current || entry.variance > current.variance ? entry : current, null);

        return {
          id: project.id,
          projectId: project.id,
          projectName: project.name,
          program: project.program,
          budget: project.budget ?? 0,
          cpi,
          spi,
          costVariance,
          scheduleVariance,
          statusHealthIndicator: wState.statusHealthIndicator || (costVariance < 0 || spi < 1 ? "Critical Risk" : "On Track"),
          criticalBlockersCount,
          criticalMilestoneVarianceDays: criticalMilestone?.variance ?? null,
          criticalMilestoneName: criticalMilestone?.name || "",
          lastSignOffBy: wState.lastSavedBy || "System",
          lastSignOffAt: wState.lastSavedAt || null,
          latestPeriod: wState.lastSavedAt ? `Saved ${formatTimestamp(wState.lastSavedAt)}` : "No PM sync",
          currentRisksText,
          mitigationPlanText,
          evmMetrics: { plannedValue, earnedValue, actualCost },
          reportingCutoff: reportingCutoff.toISOString(),
          milestones: wState.milestones || [],
        };
      } else {
        return {
          id: project.id,
          projectId: project.id,
          projectName: project.name,
          program: project.program,
          budget: project.budget ?? 0,
          cpi: 1.00,
          spi: 1.00,
          costVariance: 0,
          scheduleVariance: 0,
          statusHealthIndicator: "On Track",
          criticalBlockersCount: 0,
          criticalMilestoneVarianceDays: null,
          criticalMilestoneName: "",
          lastSignOffBy: "N/A",
          lastSignOffAt: null,
          latestPeriod: "Nominal Path Conditions",
          currentRisksText,
          mitigationPlanText,
          evmMetrics: { plannedValue: 0, earnedValue: 0, actualCost: 0 }
        };
      }
    });
  }, [filteredProjects, workbenchStates, rollups, globalReports]);

  const filteredGlobalReports = useMemo(() => {
    // Prevents the historical status reports archive table from going blank
    if (selectedProjectIds.length === 0 && activeProgram === "ALL") return globalReports;
    return globalReports.filter(r => Boolean(r.projectId && activeProjectIds.includes(r.projectId)));
  }, [globalReports, activeProjectIds, selectedProjectIds, activeProgram]);

  // 🟢 3. DERIVE DYNAMIC MILESTONES & DEPENDENCIES FROM LIVE PM WORKBENCHES
  const { activeMilestones, activeDependenciesList } = useMemo(() => {
    const activeStates = workbenchStates.filter(s => activeProjectIds.includes(s.id) || Boolean(s.projectId && activeProjectIds.includes(s.projectId)));

    const milestones = activeStates.flatMap(s => 
      (s.milestones || []).map((m: any) => ({
        ...m,
        projectId: s.projectId || s.id
      }))
    );

    const deps = activeStates.flatMap(s => 
      (s.dependencies || []).map((d: any) => ({
        ...d,
        projectId: s.projectId || s.id
      }))
    );

    return { activeMilestones: milestones, activeDependenciesList: deps };
  }, [workbenchStates, activeProjectIds]);

  const filteredMilestones = useMemo(() => {
    if (milestoneStatusFilter === "ALL") return activeMilestones;
    return activeMilestones.filter(m => m.status === milestoneStatusFilter);
  }, [activeMilestones, milestoneStatusFilter]);

  const filteredDependencies = useMemo(() => {
    if (dependencyStatusFilter === "ALL") return activeDependenciesList;
    return activeDependenciesList.filter(d => d.status === dependencyStatusFilter);
  }, [activeDependenciesList, dependencyStatusFilter]);

  // 🟢 4. RECALCULATE KPIs WITH LIVE CONSTRAINTS
  const totalMasterBudget = allProjects.reduce((acc, curr) => acc + (curr.budget || 0), 0) || 1;
  const totalBudget = filteredProjects.reduce((acc, curr) => acc + (curr.budget || 0), 0);
  const totalActuals = filteredRollups.reduce((sum, r) => sum + (r.evmMetrics?.actualCost || 0), 0);
  const activeChangeOrders = filteredProjects.filter(p => p.isUnplannedInjection).length;

  // Sum the quantity of milestones in live project_workbench_states matching type === "Construction" and showOnDashboard === true
  const constructionDependenciesCount = useMemo(() => {
    const activeStates = workbenchStates.filter(s => activeProjectIds.includes(s.id) || Boolean(s.projectId && activeProjectIds.includes(s.projectId)));
    let count = 0;
    activeStates.forEach(s => {
      (s.milestones || []).forEach((m: any) => {
        if (m.type === "Construction" && m.showOnDashboard === true) {
          count++;
        }
      });
    });
    return count;
  }, [workbenchStates, activeProjectIds]);

  const activeDependenciesCount = constructionDependenciesCount;

  // 🟢 5. TRUTHFUL TO-DATE EVM SERIES. Historical values are never interpolated.
  const dynamicSCurveData = useMemo(() => {
    const reportRecords = globalReports.filter(report => Boolean(report.projectId && activeProjectIds.includes(report.projectId)) && report.evmMetrics);
    const dates = new Set<string>();
    const datedReports = reportRecords.flatMap(report => {
      const date = normalizeDate(report.periodEnd)
        || extractReportingPeriodEnd(report.reportPeriod || report.reportingPeriod)
        || normalizeDate(report.createdAt || report.timestamp);
      if (!date) return [];
      const key = date.toISOString().slice(0, 10);
      dates.add(key);
      return [{ ...report, date }];
    });

    filteredRollups.forEach((rollup: any) => {
      const cutoff = normalizeDate(rollup.reportingCutoff);
      if (cutoff) dates.add(cutoff.toISOString().slice(0, 10));
      const completion = (rollup.milestones || []).map((m: any) => normalizeDate(m.baselineEnd || m.baselineEndDate)).filter((date: Date | null): date is Date => date !== null).sort((a: Date, b: Date) => b.getTime() - a.getTime())[0];
      if (completion) dates.add(completion.toISOString().slice(0, 10));
    });

    const periodDates = [...dates].sort();
    const aggregate = new Map(periodDates.map(periodDate => [periodDate, { Planned: 0, Actual: 0, Earned: 0, hasActual: false, hasEarned: false }]));

    filteredRollups.forEach((rollup: any) => {
      const projectReports = datedReports.filter(report => report.projectId === rollup.projectId);
      const cutoff = normalizeDate(rollup.reportingCutoff) || resolveReportingCutoff(projectReports, rollup.lastSavedAt);
      const completion = (rollup.milestones || []).map((m: any) => normalizeDate(m.baselineEnd || m.baselineEndDate)).filter((date: Date | null): date is Date => date !== null).sort((a: Date, b: Date) => b.getTime() - a.getTime())[0];
      const records = [
        ...projectReports,
        ...(rollup.evmMetrics ? [{ projectId: rollup.projectId, periodEnd: cutoff, evmMetrics: rollup.evmMetrics }] : []),
      ];
      const plannedPoints = periodDates.map(periodDate => {
        const pointDate = normalizeDate(periodDate)!;
        const latestPlannedSnapshot = projectReports
          .filter(report => report.date <= pointDate)
          .sort((a, b) => b.date.getTime() - a.date.getTime())[0];
        return {
          periodDate,
          plannedValue: completion && pointDate >= completion
            ? rollup.budget || 0
            : latestPlannedSnapshot?.evmMetrics?.plannedValue || 0,
        };
      });

      buildSparseEvmSeries(plannedPoints, records, cutoff).forEach(point => {
        const target = aggregate.get(point.periodDate);
        if (!target) return;
        target.Planned += point.Planned;
        if (point.Actual !== null) {
          target.Actual += point.Actual;
          target.hasActual = true;
        }
        if (point.Earned !== null) {
          target.Earned += point.Earned;
          target.hasEarned = true;
        }
      });
    });

    return addChronologicalTimestamps(periodDates.map(targetDate => {
      const point = aggregate.get(targetDate)!;
      return { targetDate, Planned: point.Planned, Actual: point.hasActual ? point.Actual : null, Earned: point.hasEarned ? point.Earned : null };
    }));
  }, [globalReports, activeProjectIds, filteredRollups]);

  // 🟢 6. DYNAMIC ACTIVE THREAT FILTERING (RAID MATRIX COUPLING)
  const dynamicRisks = useMemo(() => {
    const list = raidItems.filter(item => {
      const projectMatches = Boolean(item.projectId && activeProjectIds.includes(item.projectId));
      if (!projectMatches) return false;

      // Exclude items that are resolved or closed
      const isResolved = ["Resolved", "Resolved - Complete", "Closed"].includes(item.status || "");
      if (isResolved) return false;

      // Ensure classification or type is explicitly "Risk"
      const isRisk = item.classification === "Risk" || (!item.classification && item.roamCategory === "Risk");
      if (!isRisk) return false;

      return true;
    });

    return list.map(r => ({
      id: r.id,
      raidNumber: r.raidNumber,
      project: r.projectId,
      projectId: r.projectId,
      projectName: resolveProjectName(r.projectId, projectNames, r.projectName),
      threat: r.description || r.title || "Unspecified Threat",
      impact: r.importance || r.impactLevel || "High",
      spec: r.classification || r.roamCategory || "Risk",
      status: r.status || "New / Unassigned",
      roamCategory: resolveRaidOwnershipState(r as unknown as Record<string, unknown>)
    }));
  }, [raidItems, activeProjectIds, projectNames]);

  // Pagination Logic 
  const totalPages = Math.max(1, Math.ceil(filteredGlobalReports.length / itemsPerPage));
  const paginatedReports = filteredGlobalReports.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const handleNextPage = () => setCurrentPage(p => Math.min(p + 1, totalPages));
  const handlePrevPage = () => setCurrentPage(p => Math.max(p - 1, 1));



  // 5. REPORT GENERATOR (OPTIMISTIC PERFORMANCE UPGRADE)
  const handleGenerateProgramReport = () => {
    setIsGenerating(true);
    
    // ⚡ OPTIMISTIC ACCELERATION UI: Open window immediately and set payload states to dodge NextJS 15 rendering lag loops
    const totalPlannedCost = filteredRollups.reduce((sum, r) => sum + (r.evmMetrics?.plannedValue || 0), 0);
    const totalEarnedValue = filteredRollups.reduce((sum, r) => sum + (r.evmMetrics?.earnedValue || 0), 0);
    const totalActualCost = filteredRollups.reduce((sum, r) => sum + (r.evmMetrics?.actualCost || 0), 0);
    const aggregateSV = totalEarnedValue - totalPlannedCost;
    const aggregateCV = totalEarnedValue - totalActualCost;

    const criticalMilestones = activeMilestones.slice(0, 5).map(m => ({ project: m.projectId, name: m.name, status: m.status, variance: calculateVarianceDays(m.baselineEnd, m.forecastEnd) }));

    const consolidatedRisks = filteredRollups
      .filter(r => r.currentRisksText && r.currentRisksText.trim() !== "")
      .map(r => ({ project: r.projectName || r.projectId, risk: r.currentRisksText, mitigation: r.mitigationPlanText || "Pending Review", status: r.statusHealthIndicator }));

    const masterReport = {
      dateGenerated: new Date().toLocaleDateString(),
      reportingPeriod: "Past 14 Days",
      totalProjectsActive: filteredRollups.length,
      filterContext: activeProgram === "ALL" && selectedProjectIds.length === 0 ? "Global Portfolio" : `${activeProgram} Track (${selectedProjectIds.length > 0 ? selectedProjectIds.join(', ') : 'All Projects'})`,
      evm: { totalBudget, plannedCost: totalPlannedCost, actualCost: totalActualCost, aggregateSV, aggregateCV },
      criticalMilestones: criticalMilestones,
      consolidatedRisks: consolidatedRisks.length > 0 ? consolidatedRisks : [{ project: "N/A", risk: "No critical risks reported in this selection.", mitigation: "Continue monitoring.", status: "Nominal" }],
      quality: { observationsCreated: criticalBlockers.length, observationsResolved: Math.round(criticalBlockers.length * 0.7) }
    };

    setGeneratedReportData(masterReport);
    setIsGenerating(false);
    setIsReportModalOpen(true);
    toast({ title: "Report Compiled Successfully", description: "The filtered Master Program Report is ready." });
  };

  return (
    <div className="max-w-[1750px] mx-auto space-y-6 pb-12 font-sans">
      
      {/* 🧼 SCRUBBED BRANDING HEADER AREA */}
      <div className="flex items-center justify-between border-b pb-4 bg-white">
        <div className="flex items-center gap-2">
          {/* Removed AviaTrack Icon text tracking label as per requested cleanups */}
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Portfolio Control Room</h1>
            <p className="text-xs text-slate-500">Live global timeline isolation, EVM aggregation, and automated status compiling.</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex bg-slate-100 p-1 rounded border text-xs font-semibold">
            <button onClick={() => { setActiveProgram("ALL"); setSelectedProjectIds([]); }} className={`px-3 py-1.5 rounded-sm transition-all ${activeProgram === "ALL" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-200 cursor-pointer"}`}>All Portfolio</button>
            <button onClick={() => { setActiveProgram("TDP"); setSelectedProjectIds([]); }} className={`px-3 py-1.5 rounded-sm transition-all ${activeProgram === "TDP" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-200 cursor-pointer"}`}>TDP Track</button>
            <button onClick={() => { setActiveProgram("CIP"); setSelectedProjectIds([]); }} className={`px-3 py-1.5 rounded-sm transition-all ${activeProgram === "CIP" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-200 cursor-pointer"}`}>CIP Track</button>
          </div>
          <Button variant="outline" onClick={() => setIsTreeExpanded(!isTreeExpanded)} className="h-9 text-xs font-bold border-slate-200 text-slate-700 flex items-center gap-1.5 rounded-sm cursor-pointer hover:bg-slate-50">
            {isTreeExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} Isolate Projects
          </Button>
          <Button onClick={handleGenerateProgramReport} disabled={isGenerating} className="bg-[#142E88] hover:bg-[#2b27b5] text-white font-bold h-9 rounded-sm px-4 gap-2 cursor-pointer transition-all">
            {isGenerating ? "Compiling Report..." : <><Send className="h-3.5 w-3.5" /> Generate Program Report</>}
          </Button>
        </div>
      </div>

      {/* ISOLATED PROJECT SELECTOR */}
      {isTreeExpanded && (
        <Card className="border-slate-200 bg-slate-50/50 rounded-sm p-3 shadow-none">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 font-mono">Active Contract Isolation Pool ({activeProgram} Track)</div>
          <div className="flex flex-wrap gap-1.5">
            {allProjects
              .filter(p => activeProgram === "ALL" || p.program === activeProgram)
              .map(p => {
                const isSelected = selectedProjectIds.includes(p.id);
                return (
                  <button key={p.id} onClick={() => toggleProjectSelection(p.id)} className={`px-3 py-1.5 text-xs font-mono font-bold rounded-xs border transition-all cursor-pointer ${isSelected ? "bg-[#142E88] border-[#142E88] text-white shadow-xs" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"}`}>
                    {p.id} : {p.name?.slice(0, 30)}...
                  </button>
                );
              })}
          </div>
        </Card>
      )}

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-slate-200 shadow-xs rounded-sm bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Portfolio Budget</span><span className="text-xl font-black text-slate-900">${totalBudget.toLocaleString()}</span></div>
            <div className="p-2 bg-slate-50 text-slate-700 rounded-sm"><Wallet className="h-4 w-4" /></div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-xs rounded-sm bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Capital Allocated (Actuals)</span><span className="text-xl font-black text-emerald-600">${totalActuals.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-sm"><TrendingUp className="h-4 w-4" /></div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-xs rounded-sm bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Construction Dependencies</span><span className="text-xl font-black text-amber-600">{activeDependenciesCount} Pending</span></div>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-sm"><AlertTriangle className="h-4 w-4" /></div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-xs rounded-sm bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Change Orders</span><span className="text-xl font-black text-purple-600">{activeChangeOrders} Active</span></div>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-sm"><Activity className="h-4 w-4" /></div>
          </CardContent>
        </Card>
      </div>

      <LiveProjectTelemetryTable projects={filteredRollups} formatTimestamp={formatTimestamp} />

      <DynamicPortfolioTimeline
        projects={filteredProjects}
        milestones={activeMilestones}
        dependencies={activeDependenciesList}
        dateWindow={calendarBounds}
        onDateWindowChange={setCalendarBounds}
      />

      {/* MILESTONE & DEPENDENCY TABLES */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
        <Card className="border-slate-200 shadow-sm rounded-sm bg-white">
          <CardHeader className="bg-slate-50 border-b py-3">
            <CardTitle className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Clock className="h-4 w-4 text-emerald-600" /> Active Global Milestones
            </CardTitle>
            <CardDescription className="text-[11px]">Aggregated baseline vs. forecast timelines from all active projects.</CardDescription>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {TABLE_STATUS_FILTERS.map(status => (
                <Button key={status} type="button" variant="outline" size="sm" onClick={() => setMilestoneStatusFilter(status)} className={`h-6 px-2 text-[9px] font-bold ${milestoneStatusFilter === status ? "bg-[#142E88] text-white border-[#142E88] hover:bg-[#142E88] hover:text-white" : "bg-white text-slate-600"}`}>
                  {status}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto max-h-[350px] overflow-y-auto">
            {filteredMilestones.length === 0 ? <div className="p-8 text-center text-slate-400 text-xs italic">No milestones match the selected status.</div> : (
              <Table>
                <TableHeader className="sticky top-0 bg-slate-100/90 backdrop-blur-sm z-10">
                  <TableRow>
                    <TableHead className="text-[10px] font-bold uppercase">Project</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Milestone</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Baseline End</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Forecast / Actual End</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Variance</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMilestones.map((m: any, i) => {
                    const baseDate = m.baselineEnd || m.baselineEndDate;
                    const forecastDate = m.forecastEnd || m.forecastEndDate;
                    const variance = calculateVarianceDays(baseDate, forecastDate);
                    const isCompleted = m.status === 'Complete';
                    
                    return (
                      <TableRow key={i} className="hover:bg-slate-50/50">
                        <TableCell className="text-xs font-bold text-[#142E88] font-mono">{m.projectId}</TableCell>
                        <TableCell className="text-xs font-semibold">{m.tradeMilestone || m.name}</TableCell>
                        <TableCell className="text-[10px] font-mono">{baseDate || "N/A"}</TableCell>
                        <TableCell className="text-[10px] font-mono">{forecastDate || "N/A"}</TableCell>
                        <TableCell><span className={`text-[10px] font-bold font-mono ${variance === null ? 'text-slate-400' : variance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{variance === null ? "N/A" : variance > 0 ? `+${variance} Days` : `${variance} Days`}</span></TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline" 
                            className={`text-[9px] shadow-none ${
                              isCompleted ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold' : 'bg-white text-slate-700'
                            }`}
                          >
                            {isCompleted ? '🟢 Complete' : m.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm rounded-sm bg-white">
          <CardHeader className="bg-slate-50 border-b py-3">
            <CardTitle className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <GitMerge className="h-4 w-4 text-[#885BCE]" /> Active Global Dependencies
            </CardTitle>
            <CardDescription className="text-[11px]">Cross-project and trade blocks aggregated from all active tracks.</CardDescription>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {TABLE_STATUS_FILTERS.map(status => (
                <Button key={status} type="button" variant="outline" size="sm" onClick={() => setDependencyStatusFilter(status)} className={`h-6 px-2 text-[9px] font-bold ${dependencyStatusFilter === status ? "bg-[#142E88] text-white border-[#142E88] hover:bg-[#142E88] hover:text-white" : "bg-white text-slate-600"}`}>
                  {status}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto max-h-[350px] overflow-y-auto">
            {filteredDependencies.length === 0 ? <div className="p-8 text-center text-slate-400 text-xs italic">No dependencies match the selected status.</div> : (
              <Table>
                <TableHeader className="sticky top-0 bg-slate-100/90 backdrop-blur-sm z-10">
                  <TableRow>
                    <TableHead className="text-[10px] font-bold uppercase">Origin Project</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Target Entity</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Task/Activity</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDependencies.map((d: any, i) => (
                    <TableRow key={i} className="hover:bg-slate-50/50">
                      <TableCell className="text-xs font-bold text-[#142E88] font-mono">{d.projectId}</TableCell>
                      <TableCell className="text-xs font-medium text-slate-700">{d.targetEntity}</TableCell>
                      <TableCell className="text-xs text-slate-600 truncate max-w-[150px]">{d.activityTask}</TableCell>
                      <TableCell><Badge className={`text-[9px] shadow-none ${d.status === 'Active Block' ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-50' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-50'}`}>{d.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* S-CURVE & THREAT REGISTER */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-6">
        <Card className="border-slate-200 shadow-sm rounded-sm xl:col-span-2 bg-white">
          <CardHeader className="bg-slate-50 border-b py-2"><CardTitle className="text-xs font-bold text-slate-700 uppercase tracking-wider">Budget Performance (To-Date S-Curve)</CardTitle></CardHeader>
          <CardContent className="p-4 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dynamicSCurveData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis 
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={formatChartDate}
                  stroke="#334155" // Darkened to slate-700 for clear line resolution
                  style={{ 
                    fontSize: '13px', // Increased size so the boss can read the years easily
                    fontFamily: 'monospace', 
                    fontWeight: '900' // Bunted weight to maximum crispness
                  }} 
                />
                <YAxis stroke="#94a3b8" style={{ fontSize: '11px', fontFamily: 'monospace' }} tickFormatter={(val) => `$${(val / 1000000).toFixed(1)}M`} />
                <Tooltip labelFormatter={formatChartDate} formatter={(value: any) => [value === null ? "N/A" : "$" + value.toLocaleString(undefined, {maximumFractionDigits: 0}), ""]} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Line type="monotone" dataKey="Planned" stroke="#142E88" strokeWidth={3} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="Actual" stroke="#1EA7F4" strokeWidth={3} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="Earned" stroke="#10B981" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <ActiveThreatRiskRegister
          risks={dynamicRisks}
          severity={severitySelection}
          onSeverityChange={setSeveritySelection}
          statusColors={STATUS_COLORS}
        />
      </div>

      {/* GLOBAL STATUS REPORTS ARCHIVE */}
      <Card className="border-slate-200 shadow-sm rounded-sm bg-white mt-6">
        <CardHeader className="bg-slate-50 border-b py-4">
          <CardTitle className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <History className="h-4 w-4 text-slate-500" /> Global Portfolio Status Reports Archive
          </CardTitle>
          <CardDescription className="text-xs">Historical ledger of all submitted Bi-Weekly reports across all programmatic tracks.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 flex flex-col">
          <div className="overflow-x-auto">
            {filteredGlobalReports.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm italic">No status reports have been generated across the portfolio yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-slate-50/30">
                    <TableHead className="text-xs font-bold text-slate-700">Date Logged</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Project Context</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Reporting Period</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Submitted By</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">Performance (SPI / CPI)</TableHead>
                    <TableHead className="text-xs font-bold text-right text-slate-700">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedReports.map(report => (
                    <TableRow key={report.id} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="text-xs font-mono font-medium text-slate-700">{formatTimestamp(report.createdAt || report.timestamp)}</TableCell>
                      <TableCell className="text-xs font-bold text-[#142E88] font-mono">{report.projectName || report.projectId}</TableCell>
                      <TableCell className="text-xs font-semibold text-slate-700">{report.reportPeriod || report.reportingPeriod}</TableCell>
                      <TableCell className="text-xs text-slate-500">{(report.submittedBy || report.loggedBy)?.split("@")[0]}</TableCell>
                      <TableCell className="text-xs font-mono font-bold">
                        <span className={getEvmColorClass(report.spi ?? report.evmMetrics?.spi)}>SPI: {formatEvmMetric(report.spi ?? report.evmMetrics?.spi)}</span>
                        <span className="text-slate-300 mx-2">|</span>
                        <span className={getEvmColorClass(report.cpi ?? report.evmMetrics?.cpi)}>CPI: {formatEvmMetric(report.cpi ?? report.evmMetrics?.cpi)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setViewingSnapshot(report)} // <-- Change this line
                          className="text-xs font-bold text-[#142E88] h-8 cursor-pointer hover:bg-blue-50"
                        >
                          View Snapshot
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          {/* Pagination Controls */}
          {filteredGlobalReports.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50 rounded-b-sm">
              <span className="text-xs font-medium text-slate-500">Showing page {currentPage} of {totalPages} ({filteredGlobalReports.length} total reports)</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handlePrevPage} disabled={currentPage === 1} className="h-8 text-xs font-bold cursor-pointer bg-white"><ChevronLeft className="h-3 w-3 mr-1" /> Prev</Button>
                <Button variant="outline" size="sm" onClick={handleNextPage} disabled={currentPage === totalPages} className="h-8 text-xs font-bold cursor-pointer bg-white">Next <ChevronRight className="h-3 w-3 ml-1" /></Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* COMPACT MASTER STATUS MODAL LAYOUT */}
      {isReportModalOpen && generatedReportData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl my-8 flex flex-col relative print:shadow-none print:w-full">
            <div className="bg-[#142E88] text-white px-6 py-4 flex items-center justify-between rounded-t-lg print:hidden sticky top-0 z-10">
              <h3 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2"><FileText className="h-5 w-5 text-[#1EA7F4]" /> Master Program Status Report</h3>
              <div className="flex gap-2">
                <Button onClick={() => window.print()} variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20 h-8 text-xs cursor-pointer"><Printer className="h-3.5 w-3.5 mr-1.5" /> Print / Save PDF</Button>
                <button onClick={() => setIsReportModalOpen(false)} className="text-slate-300 hover:text-white transition-colors p-1 focus:outline-none cursor-pointer"><X className="h-5 w-5" /></button>
              </div>
            </div>
            
            <div className="p-10 space-y-8 bg-white text-slate-900 font-sans print:p-0">
              <div className="border-b-2 border-[#142E88] pb-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h1 className="text-3xl font-black text-[#142E88] tracking-tight uppercase">Portfolio Status Report</h1>
                    <p className="text-lg font-bold text-slate-600 mt-1">Scope: {generatedReportData.filterContext}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Date Generated</p><p className="text-sm font-mono font-bold">{generatedReportData.dateGenerated}</p>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">Reporting Period</p><p className="text-sm font-mono font-bold">{generatedReportData.reportingPeriod}</p>
                  </div>
                </div>
              </div>

              <section className="space-y-3">
                <h2 className="text-lg font-bold text-slate-800 border-b border-slate-200 pb-1 flex items-center gap-2 font-sans">Executive Summary</h2>
                <div className="bg-slate-50 p-4 rounded-sm border border-slate-200">
                  <p className="text-sm leading-relaxed text-slate-700">This report consolidates telemetry across <strong className="text-[#142E88]">{generatedReportData.totalProjectsActive} filtered project tracks</strong>. Data reflects live EVM constraints and field observations from PM workspaces.</p>
                  <div className="mt-3 grid grid-cols-2 gap-4 text-sm font-mono"><div className="bg-white p-2 border rounded-sm">Field Observations Created: <strong>{generatedReportData.quality.observationsCreated}</strong></div><div className="bg-white p-2 border rounded-sm">Field Observations Resolved: <strong>{generatedReportData.quality.observationsResolved}</strong></div></div>
                </div>
              </section>

              <div className="grid grid-cols-2 gap-8">
                <section className="space-y-3">
                  <h2 className="text-lg font-bold text-slate-800 border-b border-slate-200 pb-1 flex items-center gap-2"><Clock className="h-5 w-5 text-amber-600" /> Schedule & Milestones</h2>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase">Aggregated Schedule Variance (SV)</p>
                      <p className={`text-2xl font-black font-mono ${generatedReportData.evm.aggregateSV >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>${generatedReportData.evm.aggregateSV.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase mb-1 border-b pb-1">Critical Milestones (Top 5)</p>
                      <ul className="text-xs space-y-1.5 font-medium text-slate-700">
                        {generatedReportData.criticalMilestones.length > 0 ? (
                          generatedReportData.criticalMilestones.map((m: any, idx: number) => (
                             <li key={idx} className="flex justify-between items-center bg-slate-50 p-1.5 border rounded-sm">
                               <span className="truncate max-w-[200px]" title={`${m.name} (${m.project})`}>{m.name} <span className="text-[10px] text-slate-400 font-mono">({m.project})</span></span>
                               <div className="flex items-center gap-2">
                                 <span className={`text-[10px] font-mono font-bold ${m.variance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{m.variance > 0 ? `+${m.variance}d` : `${m.variance}d`}</span>
                                 <Badge variant="outline" className="text-[9px] bg-white shadow-none">{m.status}</Badge>
                               </div>
                             </li>
                          ))
                        ) : (<li className="text-slate-400 italic text-[10px] py-1">No critical milestones currently tracked.</li>)}
                      </ul>
                    </div>
                  </div>
                </section>
                
                <section className="space-y-3">
                  <h2 className="text-lg font-bold text-slate-800 border-b border-slate-200 pb-1 flex items-center gap-2"><Wallet className="h-5 w-5 text-emerald-600" /> Portfolio EVM & Budget</h2>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase">Aggregated Cost Variance (CV)</p>
                      <p className={`text-2xl font-black font-mono ${generatedReportData.evm.aggregateCV >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>${generatedReportData.evm.aggregateCV.toLocaleString()}</p>
                    </div>
                    <div className="bg-slate-50 p-3 border rounded-sm grid grid-cols-2 gap-y-3 text-xs">
                      <div><span className="block font-bold text-slate-500 uppercase tracking-wide text-[9px]">Approved Budget</span><span className="font-mono font-bold">${generatedReportData.evm.totalBudget.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                      <div><span className="block font-bold text-slate-500 uppercase tracking-wide text-[9px]">Planned Cost (PV)</span><span className="font-mono font-bold">${generatedReportData.evm.plannedCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                      <div className="col-span-2 border-t pt-2 mt-1"><span className="block font-bold text-slate-500 uppercase tracking-wide text-[9px]">Encumbered (Actuals) ACV</span><span className="font-mono font-bold text-lg text-emerald-700">${generatedReportData.evm.actualCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                    </div>
                  </div>
                </section>
              </div>

              <section className="space-y-3 pt-4 border-t-2 border-slate-100">
                <h2 className="text-lg font-bold text-slate-800 border-b border-slate-200 pb-1 flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-600" /> Consolidated Risks & Resolution Plans</h2>
                <div className="space-y-3">
                  {generatedReportData.consolidatedRisks.map((riskItem: any, idx: number) => (
                    <div key={idx} className={`border p-3 rounded-sm ${riskItem.status === 'Critical Risk' ? 'border-red-200 bg-red-50/30' : 'border-slate-200 bg-white'}`}>
                      <div className="flex justify-between items-start mb-1.5">
                        <h4 className="text-xs font-bold text-[#142E88] font-mono">{riskItem.project}</h4>
                        <Badge className={`text-[9px] shadow-none ${riskItem.status === 'Critical Risk' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{riskItem.status}</Badge>
                      </div>
                      <div className="text-xs grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><strong className="block text-[10px] text-slate-500 uppercase mb-0.5">Identified Risk / Threat</strong><p className="text-slate-800 leading-snug">{riskItem.risk}</p></div>
                        <div><strong className="block text-[10px] text-slate-500 uppercase mb-0.5">Resolution Plan</strong><p className="text-slate-700 leading-snug">{riskItem.mitigation}</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* 🖨️ RESTORED EXECUTIVE ISOLATION PRINT RULES */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          /* 1. Hide the entire core application, nav layouts, dashboard tracks, and action buttons */
          html, body, main, nav, aside, header, footer, button, .print\\:hidden {
            visibility: hidden !important;
            height: auto !important;
            overflow: visible !important;
          }

          /* 2. Target ONLY the open modal sheet card and force it to be visible */
          .fixed.inset-0.z-50 {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: auto !important;
            visibility: visible !important;
            display: block !important;
            overflow: visible !important;
            background: white !important;
            box-shadow: none !important;
          }

          /* 3. Ensure the child elements inside the card inherit print visibility */
          .fixed.inset-0.z-50 *, .max-w-5xl, .max-w-5xl * {
            visibility: visible !important;
          }

          /* 4. Clear layout sizing bounds so it fills the paper perfectly */
          .max-w-5xl {
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }

          /* 5. Mask the dark blue interactive header row so you don't print dark blocks */
          .bg-\\[\\#142E88\\] {
            display: none !important;
          }

          /* 6. Prevent arbitrary page breaks across your grid partitions */
          section, .grid, div {
            break-inside: avoid !important;
          }
        }
      `}} />
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
              {/* Header Meta */}
              <div className="grid grid-cols-4 gap-4 pb-4 border-b border-slate-200 bg-white p-4 rounded-sm shadow-xs">
                <div><span className="block text-[10px] font-bold text-slate-500 uppercase">Reporting Period</span><span className="text-sm font-semibold text-[#142E88]">{viewingSnapshot.reportPeriod || viewingSnapshot.reportingPeriod}</span></div>
                <div><span className="block text-[10px] font-bold text-slate-500 uppercase">Submitted By</span><span className="text-sm font-semibold text-slate-800">{(viewingSnapshot.submittedBy || viewingSnapshot.loggedBy)?.split('@')[0]}</span></div>
                <div><span className="block text-[10px] font-bold text-slate-500 uppercase">Date Logged</span><span className="text-sm font-mono font-bold text-slate-800">{formatTimestamp(viewingSnapshot.createdAt || viewingSnapshot.timestamp)}</span></div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-500 uppercase">EVM Performance</span>
                  <div className="text-sm font-mono font-bold">
                    <span className={getEvmColorClass(viewingSnapshot.spi ?? viewingSnapshot.evmMetrics?.spi)}>SPI: {formatEvmMetric(viewingSnapshot.spi ?? viewingSnapshot.evmMetrics?.spi)}</span>
                    <span className="mx-2 text-slate-300">|</span>
                    <span className={getEvmColorClass(viewingSnapshot.cpi ?? viewingSnapshot.evmMetrics?.cpi)}>CPI: {formatEvmMetric(viewingSnapshot.cpi ?? viewingSnapshot.evmMetrics?.cpi)}</span>
                  </div>
                </div>
              </div>

              {/* Narrative Content */}
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
                  <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">{viewingSnapshot.actionItems || "No action items requested."}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
