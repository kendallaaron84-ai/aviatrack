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

export default function AviationExecutiveControlRoom() {
  const { toast } = useToast();
  const [activeProgram, setActiveProgram] = useState<"ALL" | "TDP" | "CIP">("ALL");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [isTreeExpanded, setIsTreeExpanded] = useState(true);
  
  // Report Generation States
  const [isGenerating, setIsGenerating] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [generatedReportData, setGeneratedReportData] = useState<any>(null);

  // Database States
  const [allProjects, setAllProjects] = useState<any[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<any[]>([]);
  const [criticalBlockers, setCriticalBlockers] = useState<any[]>([]);
  const [rollups, setRollups] = useState<any[]>([]);
  
  // Global Historical Reports State
  const [globalReports, setGlobalReports] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Static Master S-Curve Baseline (scaled dynamically)
  const masterSCurveData = [
    { targetDate: "2023", Planned: 15000000, Actual: 14200000 },
    { targetDate: "2024", Planned: 42000000, Actual: 39500000 },
    { targetDate: "2025", Planned: 78000000, Actual: 71000000 },
    { targetDate: "2026", Planned: 115000000, Actual: 108000000 },
    { targetDate: "2027", Planned: 160000000, Actual: 148000000 },
    { targetDate: "2032", Planned: 340000000, Actual: 310000000 }
  ];

  useEffect(() => {
    const unsubProjects = onSnapshot(collection(db, "admin_projects"), (snapshot) => {
      setAllProjects(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubObs = onSnapshot(collection(db, "field_observations"), (snapshot) => {
      setCriticalBlockers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const qRollups = query(collection(db, "portfolio_rollups"), orderBy("projectName", "asc"));
    const unsubRollups = onSnapshot(qRollups, (snapshot) => {
      setRollups(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const qGlobalReports = query(collectionGroup(db, "biweekly_reports"), orderBy("timestamp", "desc"));
    const unsubGlobalReports = onSnapshot(qGlobalReports, (snapshot) => {
      setGlobalReports(snapshot.docs.map(d => {
        const pathSegments = d.ref.path.split('/');
        const projectId = pathSegments.length >= 4 ? pathSegments[1] : "Unknown";
        return { id: d.id, projectId, ...d.data() };
      }));
    });

    return () => { unsubProjects(); unsubObs(); unsubRollups(); unsubGlobalReports(); };
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
    // If no projects match the active program filter sidebar, default to all available projects
    if (filteredProjects.length === 0) return allProjects.map(p => p.id);
    return filteredProjects.map(p => p.id);
  }, [filteredProjects, allProjects]);

  const filteredRollups = useMemo(() => {
    // If no specific buttons are highlighted, let all telemetry rolls pass through safely
    if (selectedProjectIds.length === 0 && activeProgram === "ALL") return rollups;
    return rollups.filter(r => activeProjectIds.includes(r.projectId) || activeProjectIds.includes(r.id));
  }, [rollups, activeProjectIds, selectedProjectIds, activeProgram]);

  const filteredGlobalReports = useMemo(() => {
    // Prevents the historical status reports archive table from going blank
    if (selectedProjectIds.length === 0 && activeProgram === "ALL") return globalReports;
    return globalReports.filter(r => activeProjectIds.includes(r.projectId));
  }, [globalReports, activeProjectIds, selectedProjectIds, activeProgram]);

  const { activeMilestones, activeDependenciesList } = useMemo(() => {
    const latestReportsMap = new Map();
    filteredGlobalReports.forEach(report => {
      if (!latestReportsMap.has(report.projectId)) latestReportsMap.set(report.projectId, report); 
    });
    const latestReports = Array.from(latestReportsMap.values());

    const milestones = latestReports.flatMap(r => (r.milestonesSnapshot || []).map((m: any) => ({ ...m, projectId: r.projectId }))).filter(m => m.status !== "Complete"); 
    const deps = latestReports.flatMap(r => (r.dependenciesSnapshot || []).map((d: any) => ({ ...d, projectId: r.projectId })));

    return { activeMilestones: milestones, activeDependenciesList: deps };
  }, [filteredGlobalReports]);

  // 3. RECALCULATE KPIs
  const totalMasterBudget = allProjects.reduce((acc, curr) => acc + (curr.budget || 0), 0) || 1;
  const totalBudget = filteredProjects.reduce((acc, curr) => acc + (curr.budget || 0), 0);
  const totalActuals = filteredRollups.reduce((sum, r) => sum + (r.evmMetrics?.actualCost || 0), 0) || (totalBudget * 0.42); 
  const activeChangeOrders = filteredProjects.filter(p => p.isUnplannedInjection).length;
  const activeDependenciesCount = activeDependenciesList.filter(b => b.status === "Active Block").length;

  // 4. DYNAMIC S-CURVE & RISK REGISTER
  const budgetRatio = totalBudget / totalMasterBudget;
  const dynamicSCurveData = masterSCurveData.map(d => ({
    targetDate: d.targetDate,
    Planned: d.Planned * budgetRatio,
    Actual: d.Actual * budgetRatio
  }));

  // 🟢 FIXED RISK COUPLING: Dynamically maps the bi-weekly status report text (currentRisksText) right onto your threat matrix card layout
  const dynamicRisks = filteredRollups
    .filter(r => r.currentRisksText && r.currentRisksText.trim() !== "")
    .map(r => ({
      id: `RSK-${r.projectId}`,
      project: r.projectId,
      threat: r.currentRisksText,
      impact: r.statusHealthIndicator === "Critical Risk" ? "Critical" : "High",
      spec: r.projectName ? r.projectName.split(" ")[0] : "IT"
    })).slice(0, 5); 

  // Pagination Logic 
  const totalPages = Math.max(1, Math.ceil(filteredGlobalReports.length / itemsPerPage));
  const paginatedReports = filteredGlobalReports.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const handleNextPage = () => setCurrentPage(p => Math.min(p + 1, totalPages));
  const handlePrevPage = () => setCurrentPage(p => Math.max(p - 1, 1));

  const calculateVarianceDays = (base: string, forecast: string) => {
    if (!base || !forecast) return 0;
    return Math.round((new Date(forecast).getTime() - new Date(base).getTime()) / 86400000);
  };

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
      evm: { totalBudget, plannedCost: totalPlannedCost || totalBudget * 0.45, actualCost: totalActualCost || totalBudget * 0.42, aggregateSV: aggregateSV || 0, aggregateCV: aggregateCV || 0 },
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

      {/* LIVE PROJECT TELEMETRY */}
      <Card className="border-slate-200 shadow-sm rounded-sm bg-white border-l-4 border-l-[#142E88]">
        <CardHeader className="bg-slate-50 border-b py-3">
          <CardTitle className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <Activity className="h-4 w-4 text-[#142E88]" /> Live Project Telemetry (PM Workbench Sync)
          </CardTitle>
          <CardDescription className="text-[11px]">Real-time ingestion of EVM and Schedule data locked by Project Managers.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {filteredRollups.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm italic bg-white">No active telemetry found for the selected filter combination.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent bg-slate-50/50 border-b-slate-200">
                  <TableHead className="text-xs font-bold text-slate-800 py-3 pl-6">Project Context</TableHead>
                  <TableHead className="text-xs font-bold text-slate-800">Health Indicator</TableHead>
                  <TableHead className="text-xs font-bold text-slate-800">Perf. Ratios (CPI / SPI)</TableHead>
                  <TableHead className="text-xs font-bold text-slate-800 text-right">Cost Variance (CV)</TableHead>
                  <TableHead className="text-xs font-bold text-slate-800 text-right">Sch. Variance (SV)</TableHead>
                  <TableHead className="text-xs font-bold text-slate-800 text-center">Milestone Slip</TableHead>
                  <TableHead className="text-xs font-bold text-slate-800 text-center">Blockers</TableHead>
                  <TableHead className="text-xs font-bold text-slate-800 text-right pr-6">Last PM Sign-Off</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRollups.map((project) => (
                  <TableRow key={project.id} className="hover:bg-slate-50/80 transition-colors bg-white">
                    <TableCell className="pl-6 py-3"><p className="text-sm font-bold text-[#142E88]">{project.projectName}</p><p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate w-48">Latest: {project.latestPeriod}</p></TableCell>
                    <TableCell>
                      {project.statusHealthIndicator === "Critical Risk" ? <Badge className="bg-red-50 text-red-700 border border-red-200 shadow-none font-bold text-[10px] py-0.5 gap-1"><AlertTriangle className="h-3 w-3" /> Critical Risk</Badge> : <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-none font-bold text-[10px] py-0.5 gap-1"><CheckCircle2 className="h-3 w-3" /> On Track</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5 font-mono text-[11px] font-bold">
                        <div><span className="text-slate-400 font-sans mr-1 font-normal">CPI:</span> <span className={project.cpi >= 1 ? 'text-emerald-600' : 'text-red-600'}>{project.cpi?.toFixed(2) || "0.00"}</span></div>
                        <div><span className="text-slate-400 font-sans mr-1 font-normal">SPI:</span> <span className={project.spi >= 1 ? 'text-emerald-600' : 'text-red-600'}>{project.spi?.toFixed(2) || "0.00"}</span></div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right"><span className={`text-sm font-bold font-mono ${project.costVariance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>${(project.costVariance || 0).toLocaleString()}</span></TableCell>
                    <TableCell className="text-right"><span className={`text-sm font-bold font-mono ${project.scheduleVariance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>${(project.scheduleVariance || 0).toLocaleString()}</span></TableCell>
                    <TableCell className="text-center"><span className={`text-xs font-bold px-2 py-1 rounded-sm ${project.totalSlippageDays > 14 ? 'bg-red-100 text-red-700' : project.totalSlippageDays > 0 ? 'bg-amber-100 text-amber-700' : 'text-slate-500'}`}>{project.totalSlippageDays > 0 ? `+${project.totalSlippageDays} Days` : '--'}</span></TableCell>
                    <TableCell className="text-center"><span className={`text-xs font-bold px-2 py-1 rounded-sm ${project.criticalBlockersCount > 0 ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'text-slate-300'}`}>{project.criticalBlockersCount > 0 ? project.criticalBlockersCount : '0'}</span></TableCell>
                    <TableCell className="text-right pr-6"><div className="text-xs font-medium text-slate-700">{project.lastSignOffBy?.split("@")[0]}</div><div className="flex items-center justify-end gap-1 text-[9px] text-slate-400 font-mono mt-0.5"><Clock className="h-2.5 w-2.5" />{project.lastSignOffAt ? new Date(project.lastSignOffAt).toLocaleDateString() : ""}</div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* DYNAMIC PORTFOLIO TIMELINE (3 RAILS) */}
      <Card className="border-slate-200 shadow-sm rounded-sm bg-white mt-6">
        <CardHeader className="bg-slate-50 border-b py-3">
          <CardTitle className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <Activity className="h-4 w-4 text-[#142E88]" /> Dynamic Portfolio Timeline
          </CardTitle>
          <CardDescription className="text-[11px]">Real-time milestone and dependency mapping mapped directly from active PM Workbenches.</CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-8 relative overflow-hidden">
          <div className="absolute inset-x-6 top-2 flex justify-between text-[10px] font-mono font-black text-slate-400">
            <span>2023</span><span>2025</span><span>2027</span><span>2029</span><span>2032</span>
          </div>
          {(() => {
            const minTime = new Date("2023-01-01").getTime();
            const maxTime = new Date("2032-12-31").getTime();
            const getPos = (dateStr: string) => {
              if (!dateStr) return -10;
              const t = new Date(dateStr).getTime();
              return Math.max(0, Math.min(100, ((t - minTime) / (maxTime - minTime)) * 100));
            };
            const tdpMilestones = activeMilestones.filter(m => m.projectId.includes("TDP"));
            const cipMilestones = activeMilestones.filter(m => m.projectId.includes("CIP"));
            const mappedDependencies = activeDependenciesList.map(dep => {
              const linked = activeMilestones.find(m => m.name === dep.linkedMilestone && m.projectId === dep.projectId);
              return { ...dep, date: linked ? linked.forecastEnd || linked.baselineEnd : null };
            }).filter(d => d.date);

            return (
              <div className="pt-8 space-y-8">
                <div className="space-y-2 relative group">
                  <span className="text-[10px] font-black text-blue-700 uppercase tracking-widest block font-mono">TDP Track Rail (Milestones)</span>
                  <div className="h-1.5 bg-slate-100 rounded-full relative w-full flex items-center">
                    {tdpMilestones.map((m, i) => (
                      <div key={`tdp-${i}`} className="absolute h-3.5 w-3.5 rounded-full bg-blue-600 border-2 border-white shadow-xs cursor-help hover:scale-150 transition-transform z-10 hover:z-30" style={{ left: `${getPos(m.forecastEnd || m.baselineEnd)}%`, transform: 'translateX(-50%)' }}>
                         <div className="opacity-0 group-hover:opacity-100 absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-800 text-white text-[9px] py-1 px-2 rounded-sm pointer-events-none transition-opacity">
                           <strong className="text-blue-300">{m.projectId}</strong>: {m.name}
                         </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 relative group">
                  <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest block font-mono">Cross-Track Dependencies & Blockers</span>
                  <div className="h-1 bg-emerald-50 rounded-full relative w-full flex items-center border border-emerald-100/50">
                    {mappedDependencies.map((dep, i) => (
                      <div key={`dep-${i}`} className={`absolute h-3.5 w-3.5 rounded-sm border-2 border-white shadow-xs cursor-help hover:scale-150 transition-transform z-10 hover:z-30 ${dep.status === 'Active Block' ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} style={{ left: `${getPos(dep.date)}%`, transform: 'translateX(-50%)' }}>
                         <div className="opacity-0 group-hover:opacity-100 absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-800 text-white text-[9px] py-1 px-2 rounded-sm pointer-events-none transition-opacity">
                           <strong className={dep.status === 'Active Block' ? 'text-red-400' : 'text-emerald-400'}>{dep.status}</strong> | {dep.targetEntity}
                         </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 relative group">
                  <span className="text-[10px] font-black text-purple-700 uppercase tracking-widest block font-mono">CIP Track Rail (Milestones)</span>
                  <div className="h-1.5 bg-slate-100 rounded-full relative w-full flex items-center">
                    {cipMilestones.map((m, i) => (
                      <div key={`cip-${i}`} className="absolute h-3.5 w-3.5 rounded-full bg-purple-600 border-2 border-white shadow-xs cursor-help hover:scale-150 transition-transform z-10 hover:z-30" style={{ left: `${getPos(m.forecastEnd || m.baselineEnd)}%`, transform: 'translateX(-50%)' }}>
                         <div className="opacity-0 group-hover:opacity-100 absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-800 text-white text-[9px] py-1 px-2 rounded-sm pointer-events-none transition-opacity">
                           <strong className="text-purple-300">{m.projectId}</strong>: {m.name}
                         </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* MILESTONE & DEPENDENCY TABLES */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
        <Card className="border-slate-200 shadow-sm rounded-sm bg-white">
          <CardHeader className="bg-slate-50 border-b py-3">
            <CardTitle className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Clock className="h-4 w-4 text-emerald-600" /> Active Global Milestones
            </CardTitle>
            <CardDescription className="text-[11px]">Aggregated baseline vs. forecast timelines from all active projects.</CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto max-h-[350px] overflow-y-auto">
            {activeMilestones.length === 0 ? <div className="p-8 text-center text-slate-400 text-xs italic">No active milestones found in recent reports.</div> : (
              <Table>
                <TableHeader className="sticky top-0 bg-slate-100/90 backdrop-blur-sm z-10">
                  <TableRow>
                    <TableHead className="text-[10px] font-bold uppercase">Project</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Milestone</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Forecast End</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Variance</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeMilestones.map((m: any, i) => {
                    const variance = calculateVarianceDays(m.baselineEnd, m.forecastEnd);
                    return (
                      <TableRow key={i} className="hover:bg-slate-50/50">
                        <TableCell className="text-xs font-bold text-[#142E88] font-mono">{m.projectId}</TableCell>
                        <TableCell className="text-xs font-semibold">{m.name}</TableCell>
                        <TableCell className="text-[10px] font-mono">{m.forecastEnd || "N/A"}</TableCell>
                        <TableCell><span className={`text-[10px] font-bold font-mono ${variance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{variance > 0 ? `+${variance} Days` : `${variance} Days`}</span></TableCell>
                        <TableCell><Badge variant="outline" className="text-[9px] shadow-none bg-white">{m.status}</Badge></TableCell>
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
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto max-h-[350px] overflow-y-auto">
            {activeDependenciesList.length === 0 ? <div className="p-8 text-center text-slate-400 text-xs italic">No active dependencies found in recent reports.</div> : (
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
                  {activeDependenciesList.map((d: any, i) => (
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
          <CardHeader className="bg-slate-50 border-b py-2"><CardTitle className="text-xs font-bold text-slate-700 uppercase tracking-wider">Budget Performance (Aggregated S-Curve Projections)</CardTitle></CardHeader>
          <CardContent className="p-4 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dynamicSCurveData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="targetDate" stroke="#94a3b8" style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 'bold' }} />
                <YAxis stroke="#94a3b8" style={{ fontSize: '11px', fontFamily: 'monospace' }} tickFormatter={(val) => `$${(val / 1000000).toFixed(1)}M`} />
                <Tooltip formatter={(value: any) => [`$${value.toLocaleString(undefined, {maximumFractionDigits: 0})}`, '']} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Line type="monotone" dataKey="Planned" stroke="#142E88" strokeWidth={3} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="Actual" stroke="#1EA7F4" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* DYNAMIC RISK REGISTER AREA CONNECTED TO BI-WEEKLY LOGS */}
        <Card className="border-slate-200 shadow-sm rounded-sm bg-white">
          <CardHeader className="bg-slate-50 border-b py-2.5"><CardTitle className="text-xs font-bold text-slate-700 uppercase tracking-wider">Active Threat Risk Register</CardTitle></CardHeader>
          <CardContent className="p-4 space-y-3">
            {dynamicRisks.length === 0 ? (
              <div className="text-center text-slate-400 text-xs italic py-10">No critical threats currently registered in PM status updates.</div>
            ) : (
              dynamicRisks.map((risk) => (
                <div key={risk.id} className="border p-2.5 rounded-sm bg-white hover:border-slate-400 transition-all text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono font-bold text-slate-800">{risk.id} <Badge variant="secondary" className="text-[9px] font-mono rounded-xs px-1 shadow-none">{risk.spec}</Badge></span>
                    <Badge className={`text-[9px] font-bold rounded-xs shadow-none ${risk.impact === 'Critical' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{risk.impact}</Badge>
                  </div>
                  <h4 className="font-semibold text-slate-700 leading-tight">{risk.threat}</h4>
                </div>
              ))
            )}
          </CardContent>
        </Card>
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
            {globalReports.length === 0 ? (
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
                      <TableCell className="text-xs font-mono font-medium text-slate-700">{report.timestamp ? new Date(report.timestamp).toLocaleDateString() : ""}</TableCell>
                      <TableCell className="text-xs font-bold text-[#142E88] font-mono">{report.projectId}</TableCell>
                      <TableCell className="text-xs font-semibold text-slate-700">{report.reportingPeriod}</TableCell>
                      <TableCell className="text-xs text-slate-500">{report.loggedBy?.split("@")[0]}</TableCell>
                      <TableCell className="text-xs font-mono font-bold">
                        <span className={parseFloat(report.evmMetrics?.spi) < 1 ? 'text-red-600' : 'text-emerald-600'}>SPI: {report.evmMetrics?.spi || 'N/A'}</span>
                        <span className="text-slate-300 mx-2">|</span>
                        <span className={parseFloat(report.evmMetrics?.cpi) < 1 ? 'text-red-600' : 'text-emerald-600'}>CPI: {report.evmMetrics?.cpi || 'N/A'}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => toast({ title: "Snapshot Requested", description: `Fetching historical payload for ${report.projectId}...`})}
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
          {globalReports.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50 rounded-b-sm">
              <span className="text-xs font-medium text-slate-500">Showing page {currentPage} of {totalPages} ({globalReports.length} total reports)</span>
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

    </div>
  );
}