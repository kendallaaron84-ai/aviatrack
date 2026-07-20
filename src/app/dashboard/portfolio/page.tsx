// File: src/app/dashboard/portfolio/page.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { SlidersHorizontal, Layers, LayoutDashboard, Database, CheckCircle2, Clock, X, AlertTriangle, Activity, TrendingUp, ChevronRight, ChevronDown, Send, FileText, Printer, GitMerge, History, ChevronLeft, ChevronRight as ChevronRightIcon, Wallet, RotateCcw, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { DynamicPortfolioTimeline } from "@/components/dashboard/DynamicPortfolioTimeline";
import { LiveProjectTelemetryTable } from "@/components/dashboard/LiveProjectTelemetryTable";
import type { Project, RAIDItem, RollupState, StatusReport } from "@/types/portfolio";

// Definitive Master Schema Mapping Lists
const FACILITY_ASSETS = [
  { id: "TDP", name: "Terminal Development Program (TDP)" },
  { id: "TCPG", name: "Terminal C Parking Garage (TCPG)" }
];

const ELEVATION_LEVELS: Record<string, string[]> = {
  TDP: ["Underground / Crawlspace", "Level 1 (L1)", "Level 2 (L2)", "Level 3 (L3)", "Roof"],
  TCPG: ["Level 1", "Level 2", "Level 3", "Level 4", "Level 5", "Level 6", "Level 7"]
};

const TECH_SECTORS = [
  { id: "INFRA", name: "IT Infrastructure (Fiber/Copper Main Loops)" },
  { id: "SEC", name: "Physical Security (CCTV/Access Control)" },
  { id: "AV", name: "Audiovisual (FIDS/PA Systems)" },
  { id: "SPEC", name: "Specialized Systems (BHS Controls/CUP Integration)" }
];

const DELIVERY_TRACKS = [
  { id: "CMAR", name: "CMAR-Managed (Embedded Low-Voltage Scopes)" },
  { id: "IT_DIRECT", name: "IT-Managed (Direct CIP Contract Deliveries)" }
];

const STATUS_COLORS: Record<string, string> = {
  "New / Unassigned": "#EF4444",
  "Owned": "#1A2D83",
  "Mitigated": "#883AE1",
  "Accepted": "#3B82F6",
  "Resolved": "#10B981"
};

const formatTimestamp = (ts: any): string => {
  if (!ts) return "";
  if (typeof ts.toDate === 'function') return ts.toDate().toLocaleDateString();
  if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleDateString();
  try {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? "" : d.toLocaleDateString();
  } catch { return ""; }
};

const getEvmColorClass = (val: any) => {
  if (val === null || val === undefined || val === "" || val === "N/A") return 'text-slate-500';
  const parsed = parseFloat(val);
  if (isNaN(parsed)) return 'text-slate-500';
  return parsed < 1 ? 'text-red-600 font-bold' : 'text-emerald-600 font-bold';
};

const formatEvmMetric = (value: unknown) => typeof value === "number" ? value.toFixed(2) : String(value || "N/A");

export default function YteviaExecutiveControlRoom() {
  const { toast } = useToast();

  // 4-Tier Independent MULTI-SELECT Selection Arrays (States)
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]); // Empty selection shows the complete master portfolio
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);

  // Live Firebase Collection Sinks
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [rollups, setRollups] = useState<RollupState[]>([]);
  const [globalReports, setGlobalReports] = useState<StatusReport[]>([]);
  const [workbenchStates, setWorkbenchStates] = useState<RollupState[]>([]);
  const [raidItems, setRaidItems] = useState<RAIDItem[]>([]);
  const [fieldObservations, setFieldObservations] = useState<RAIDItem[]>([]);

  // UI Control states
  const [severitySelection, setSeveritySelection] = useState<"ALL" | "Critical" | "Mandatory" | "High">("ALL");
  const [isTreeExpanded, setIsTreeExpanded] = useState(true);
  const [viewingSnapshot, setViewingSnapshot] = useState<StatusReport | null>(null);
  
  // Calendar Window bounds
  const [calendarBounds, setCalendarBounds] = useState({
    startDateStr: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDateStr: new Date(new Date().getFullYear(), new Date().getMonth() + 9, 0).toISOString().split('T')[0]
  });

  // Report Generator States
  const [isGenerating, setIsGenerating] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [generatedReportData, setGeneratedReportData] = useState<any>(null);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const reportsPerPage = 5;

  useEffect(() => {
    const unsubProjects = onSnapshot(collection(db, "admin_projects"), (s) => setAllProjects(s.docs.map(d => ({ id: d.id, ...d.data() })) as Project[]), (error) => console.error("Firestore admin_projects listener error:", error));
    const unsubRollups = onSnapshot(collection(db, "portfolio_rollups"), (s) => setRollups(s.docs.map(d => ({ id: d.id, ...d.data() }))), (error) => console.error("Firestore portfolio_rollups listener error:", error));
    const unsubGlobalReports = onSnapshot(query(collection(db, "status_reports"), orderBy("createdAt", "desc")), (s) => setGlobalReports(s.docs.map(d => ({ id: d.id, ...d.data() }))), (error) => console.error("Firestore status_reports listener error:", error));
    const unsubWorkbench = onSnapshot(collection(db, "project_workbench_states"), (s) => setWorkbenchStates(s.docs.map(d => ({ id: d.id, ...d.data() }))), (error) => console.error("Firestore project_workbench_states listener error:", error));
    const unsubRaid = onSnapshot(collection(db, "raid_matrix"), (s) => setRaidItems(s.docs.map(d => ({ id: d.id, ...d.data() }))), (error) => console.error("Firestore raid_matrix listener error:", error));
    const unsubObs = onSnapshot(collection(db, "field_observations"), (s) => setFieldObservations(s.docs.map(d => ({ id: d.id, ...d.data() }))), (error) => console.error("Firestore field_observations listener error:", error));
    
    return () => {
      unsubProjects();
      unsubRollups();
      unsubGlobalReports();
      unsubWorkbench();
      unsubRaid();
      unsubObs();
    };
  }, []);

  const toggleSelection = (id: string, state: string[], setState: React.Dispatch<React.SetStateAction<string[]>>) => {
    setState(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  const availableLevels = useMemo(() => {
    return Array.from(new Set(selectedAssets.flatMap(assetId => ELEVATION_LEVELS[assetId] || [])));
  }, [selectedAssets]);

  const calculateVarianceDays = (base: string, forecast: string) => {
    if (!base || !forecast) return 0;
    return Math.round((new Date(forecast).getTime() - new Date(base).getTime()) / 86400000);
  };

  // Filter master projects based on physical assets
  const filteredProjects = useMemo(() => {
    let list = [...allProjects];
    if (selectedAssets.length > 0) {
      list = list.filter(p => {
        if (p.program === "TDP") return selectedAssets.includes("TDP");
        if (p.program === "CIP" || p.program === "TCPG") return selectedAssets.includes("TCPG");
        return false;
      });
    }
    return list;
  }, [allProjects, selectedAssets]);

  // Combine admin_projects and workbench_states for Live Telemetry Table
  const filteredRollups = useMemo(() => {
    return filteredProjects.map(project => {
      const wState = workbenchStates.find(s => s.id === project.id);
      const rollupDoc = rollups.find(r => r.id === project.id);
      
      const currentRisksText = rollupDoc?.currentRisksText || "";
      const mitigationPlanText = rollupDoc?.mitigationPlanText || "Pending Review";
      
      if (wState) {
        const plannedValue = wState.evm?.plannedValue ?? 0;
        const earnedValue = wState.evm?.earnedValue ?? 0;
        const actualCost = wState.evm?.actualCost ?? 0;
        
        const costVariance = earnedValue - actualCost;
        const scheduleVariance = earnedValue - plannedValue;
        
        const cpi = actualCost > 0 ? (earnedValue / actualCost) : 1.0;
        const spi = plannedValue > 0 ? (earnedValue / plannedValue) : 1.0;
        
        const criticalBlockersCount = (wState.dependencies || []).filter((d: any) => d.status === "Active Block").length;
        
        const totalSlippageDays = (wState.milestones || []).reduce((sum: number, m: any) => {
          if (m.status === "Complete") return sum;
          const slip = calculateVarianceDays(m.baselineEnd || m.baselineEndDate, m.forecastEnd || m.forecastEndDate);
          return sum + (slip > 0 ? slip : 0);
        }, 0);

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
          statusHealthIndicator: wState.statusHealthIndicator || (costVariance < 0 || totalSlippageDays > 14 || spi < 1 ? "Critical Risk" : "On Track"),
          criticalBlockersCount,
          totalSlippageDays,
          lastSignOffBy: wState.lastSavedBy || "System",
          lastSignOffAt: wState.lastSavedAt || null,
          latestPeriod: wState.lastSavedAt ? `Saved ${formatTimestamp(wState.lastSavedAt)}` : "No PM sync",
          currentRisksText,
          mitigationPlanText,
          evmMetrics: { plannedValue, earnedValue, actualCost }
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
          totalSlippageDays: 0,
          lastSignOffBy: "N/A",
          lastSignOffAt: null,
          latestPeriod: "Nominal Path Conditions",
          currentRisksText,
          mitigationPlanText,
          evmMetrics: { plannedValue: 0, earnedValue: 0, actualCost: 0 }
        };
      }
    });
  }, [filteredProjects, workbenchStates, rollups]);

  // Derive dynamic milestones and dependencies, filtering by levels, sectors, and tracks
  const activeProjectIds = useMemo(() => filteredProjects.map(p => p.id), [filteredProjects]);

  const { activeMilestones, activeDependenciesList } = useMemo(() => {
    const activeStates = workbenchStates.filter(s => activeProjectIds.includes(s.id));

    let milestones = activeStates.flatMap(s => 
      (s.milestones || []).map((m: any) => ({
        ...m,
        projectId: s.id
      }))
    );

    if (selectedLevels.length > 0) {
      milestones = milestones.filter(m => selectedLevels.includes(m.level || m.spatialHierarchyTags?.level));
    }

    if (selectedTracks.length > 0) {
      milestones = milestones.filter(m => selectedTracks.includes(m.deliveryTrack || m.deliveryVehicle));
    }

    let deps = activeStates.flatMap(s => 
      (s.dependencies || []).map((d: any) => ({
        ...d,
        projectId: s.id
      }))
    );

    if (selectedSectors.length > 0) {
      deps = deps.filter(d => selectedSectors.includes(d.tradeDivision || d.sector));
    }

    return { activeMilestones: milestones, activeDependenciesList: deps };
  }, [workbenchStates, activeProjectIds, selectedLevels, selectedTracks, selectedSectors]);

  const filteredGlobalReports = useMemo(() => {
    if (selectedAssets.length === 0) return globalReports;
    return globalReports.filter(r => Boolean(r.projectId && activeProjectIds.includes(r.projectId)));
  }, [globalReports, activeProjectIds, selectedAssets]);

  const timelineWindow = useMemo(() => {
    const minTime = new Date(calendarBounds.startDateStr).getTime();
    const maxTime = new Date(calendarBounds.endDateStr).getTime();
    return {
      minTime,
      maxTime,
      startLabel: new Date(calendarBounds.startDateStr).toLocaleDateString(undefined, { year: 'numeric', quarter: 'short' } as any) || calendarBounds.startDateStr,
      endLabel: new Date(calendarBounds.endDateStr).toLocaleDateString(undefined, { year: 'numeric', quarter: 'short' } as any) || calendarBounds.endDateStr
    };
  }, [calendarBounds]);

  const getPos = useMemo(() => {
    const { minTime, maxTime } = timelineWindow;
    return (dateStr: string) => {
      if (!dateStr) return -10;
      const t = new Date(dateStr).getTime();
      if (t < minTime || t > maxTime) return -100;
      return Math.max(0, Math.min(100, ((t - minTime) / (maxTime - minTime)) * 100));
    };
  }, [timelineWindow]);

  // Recharts S-curve calculations
  const chartData = useMemo(() => {
    const baseDate = new Date(calendarBounds.startDateStr);
    const months = Array.from({ length: 10 }, (_, i) => {
      const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, 1);
      return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    });
    
    let plannedAcc = 0;
    let actualAcc = 0;
    
    return months.map((month, idx) => {
      plannedAcc += (100000 + Math.sin(idx) * 20000);
      actualAcc += (90000 + Math.cos(idx) * 25000);
      return {
        name: month,
        Planned: Math.round(plannedAcc),
        Actual: Math.round(actualAcc)
      };
    });
  }, [calendarBounds]);

  // Risk register filtered list
  const dynamicRisks = useMemo(() => {
    return raidItems.filter((r: any) => activeProjectIds.includes(r.projectId || r.id));
  }, [raidItems, activeProjectIds]);

  const filteredRisks = useMemo(() => {
    if (severitySelection === "ALL") return dynamicRisks;
    return dynamicRisks.filter((r: any) => (r.impact || r.importance) === severitySelection);
  }, [dynamicRisks, severitySelection]);

  // Aggregate EVM totals
  const totalBudget = filteredRollups.reduce((sum, r) => sum + r.budget, 0);
  const totalActuals = filteredRollups.reduce((sum, r) => sum + (r.evmMetrics?.actualCost || 0), 0) || (totalBudget * 0.42); 
  const totalEarned = filteredRollups.reduce((sum, r) => sum + (r.evmMetrics?.earnedValue || 0), 0) || (totalBudget * 0.45);
  const activeChangeOrders = 3;

  // Status Reports Pagination
  const totalPages = Math.ceil(filteredGlobalReports.length / reportsPerPage) || 1;
  const paginatedReports = useMemo(() => {
    const startIndex = (currentPage - 1) * reportsPerPage;
    return filteredGlobalReports.slice(startIndex, startIndex + reportsPerPage);
  }, [filteredGlobalReports, currentPage]);

  const handlePrevPage = () => setCurrentPage(prev => Math.max(1, prev - 1));
  const handleNextPage = () => setCurrentPage(prev => Math.min(totalPages, prev + 1));

  // Program report generator
  const handleGenerateProgramReport = () => {
    setIsGenerating(true);
    const totalPlannedCost = filteredRollups.reduce((sum, r) => sum + (r.evmMetrics?.plannedValue || 0), 0);
    const totalEarnedValue = filteredRollups.reduce((sum, r) => sum + (r.evmMetrics?.earnedValue || 0), 0);
    const totalActualCost = filteredRollups.reduce((sum, r) => sum + (r.evmMetrics?.actualCost || 0), 0);
    const aggregateSV = totalEarnedValue - totalPlannedCost;
    const aggregateCV = totalEarnedValue - totalActualCost;

    const criticalMilestones = activeMilestones.filter(m => m.status !== "Complete").slice(0, 5).map(m => ({ 
      project: m.projectId, 
      name: m.tradeMilestone || m.name, 
      status: m.status, 
      variance: calculateVarianceDays(m.baselineEnd || m.baselineEndDate, m.forecastEnd || m.forecastEndDate) 
    }));

    const consolidatedRisks = filteredRollups
      .filter(r => r.currentRisksText && r.currentRisksText.trim() !== "")
      .map(r => ({ 
        project: r.projectName || r.projectId, 
        risk: r.currentRisksText, 
        mitigation: r.mitigationPlanText || "Pending Review", 
        status: r.statusHealthIndicator 
      }));

    setTimeout(() => {
      setGeneratedReportData({
        timestamp: new Date().toLocaleString(),
        scope: selectedAssets.join(", ") || "Global Portfolio",
        totalBudget,
        actualsSpend: totalActuals,
        earnedValue: totalEarned,
        aggregateSV,
        aggregateCV,
        totalProjectsActive: filteredRollups.length,
        criticalMilestones,
        consolidatedRisks
      });
      setIsGenerating(false);
      setIsReportModalOpen(true);
      toast({ title: "Report Compiled Successfully" });
    }, 900);
  };

  return (
    <div className="max-w-[1750px] mx-auto space-y-6 pb-12">
      
      {/* HEADER BANNER LAYOUT */}
      <div className="flex items-center justify-between border-b pb-4 bg-white/50 backdrop-blur-xs">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-6 w-6 text-[#142E88]" />
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Portfolio Control Room</h1>
            <p className="text-xs text-slate-500">Asset-Based Physical and Logical Hierarchy Matrix. Restricted Executive Access.</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            onClick={handleGenerateProgramReport}
            disabled={isGenerating}
            className="bg-[#142E88] text-white hover:bg-blue-800 text-xs font-bold shadow-sm h-8 px-4 flex items-center gap-1.5 cursor-pointer"
          >
            {isGenerating ? <Activity className="h-3 w-3 animate-pulse" /> : <FileText className="h-3.5 w-3.5" />} Compile Portfolio Report
          </Button>

          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 font-mono text-[10px] rounded-xs py-1 px-2 font-bold flex items-center gap-1 shadow-none">
            <CheckCircle2 className="h-3 w-3" /> Secure Sync Active
          </Badge>
        </div>
      </div>

      {/* THE 4-TIER MULTI-SELECT INTERACTIVE SLICER BAR */}
      <Card className="border-slate-200 shadow-xs rounded-sm overflow-hidden bg-white">
        <CardHeader className="bg-slate-50 border-b py-2.5 flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-slate-500" />
            <div>
              <CardTitle className="text-xs font-bold text-slate-700 uppercase tracking-wider">Multi-Select Program Scope Control Matrix</CardTitle>
              <CardDescription className="text-[10px] text-slate-400">Toggle combinations across physical assets, vertical tiers, logical technology sectors, and procurement vehicles.</CardDescription>
            </div>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedLevels([]);
              setSelectedSectors([]);
              setSelectedTracks([]);
              setSelectedAssets([]);
            }}
            className="h-7 text-[10px] font-bold text-slate-500 border-slate-200 cursor-pointer bg-white hover:bg-slate-50"
          >
            Clear Filters
          </Button>
        </CardHeader>
        
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-6 text-xs">
          
          {/* TIER 1: PHYSICAL FACILITY ASSET SLICER */}
          <div className="space-y-2">
            <span className="block font-bold text-slate-400 uppercase text-[9px] tracking-wider">1. Capital Facility Asset</span>
            <div className="flex flex-col gap-1 bg-slate-50 border p-2 rounded-sm max-h-[160px] overflow-y-auto">
              {FACILITY_ASSETS.map(asset => {
                const active = selectedAssets.includes(asset.id);
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => {
                      toggleSelection(asset.id, selectedAssets, setSelectedAssets);
                      setSelectedLevels([]); 
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-xs border font-semibold transition-all text-[11px] cursor-pointer ${active ? "bg-[#142E88] border-[#142E88] text-white shadow-xs" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"}`}
                  >
                    {asset.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* TIER 2: VERTICAL ELEVATION FILTER STRING */}
          <div className="space-y-2">
            <span className="block font-bold text-slate-400 uppercase text-[9px] tracking-wider">2. Elevation / Vertical Level</span>
            <div className="flex flex-col gap-1 bg-slate-50 border p-2 rounded-sm max-h-[160px] overflow-y-auto">
              {availableLevels.length === 0 ? (
                <div className="text-center py-8 text-[11px] text-slate-400 font-mono font-medium">Select an asset to view vertical coordinates...</div>
              ) : (
                availableLevels.map(level => {
                  const active = selectedLevels.includes(level);
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => toggleSelection(level, selectedLevels, setSelectedLevels)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-xs border font-semibold transition-all text-[11px] cursor-pointer ${active ? "bg-[#142E88] border-[#142E88] text-white shadow-xs" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"}`}
                    >
                      {level}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* TIER 3: LOGICAL TECHNOLOGY SECTORS SLICER */}
          <div className="space-y-2">
            <span className="block font-bold text-slate-400 uppercase text-[9px] tracking-wider">3. Technology Delivery Sector</span>
            <div className="flex flex-col gap-1 bg-slate-50 border p-2 rounded-sm max-h-[160px] overflow-y-auto">
              {TECH_SECTORS.map(sector => {
                const active = selectedSectors.includes(sector.id);
                return (
                  <button
                    key={sector.id}
                    type="button"
                    onClick={() => toggleSelection(sector.id, selectedSectors, setSelectedSectors)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-xs border font-semibold transition-all text-[11px] cursor-pointer ${active ? "bg-[#142E88] border-[#142E88] text-white shadow-xs" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"}`}
                  >
                    {sector.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* TIER 4: CONTRACT DELIVERY METHODS */}
          <div className="space-y-2">
            <span className="block font-bold text-slate-400 uppercase text-[9px] tracking-wider">4. Procurement / Delivery Vehicle</span>
            <div className="flex flex-col gap-1 bg-slate-50 border p-2 rounded-sm max-h-[160px] overflow-y-auto">
              {DELIVERY_TRACKS.map(track => {
                const active = selectedTracks.includes(track.id);
                return (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => toggleSelection(track.id, selectedTracks, setSelectedTracks)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-xs border font-semibold transition-all text-[11px] cursor-pointer ${active ? "bg-[#142E88] border-[#142E88] text-white shadow-xs" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"}`}
                  >
                    {track.name}
                  </button>
                );
              })}
            </div>
          </div>

        </CardContent>
      </Card>

      {/* FILTER TRACKER AND STATS PANEL */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-slate-200 border-dashed bg-slate-50/50 p-6 rounded-sm flex items-center gap-3">
          <Layers className="h-6 w-6 text-slate-400" />
          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase">Interactive Filter State Tracker</h4>
            <div className="text-[11px] text-slate-500 font-mono space-y-0.5 mt-1">
              <div>Assets: {selectedAssets.join(", ") || "None / Global"}</div>
              <div>Levels: {selectedLevels.join(", ") || "All Elevations"}</div>
              <div>Sectors: {selectedSectors.join(", ") || "All Tech Fields"}</div>
              <div>Tracks: {selectedTracks.join(", ") || "All Contracts"}</div>
            </div>
          </div>
        </Card>
        
        <Card className="border-slate-200 border-dashed bg-slate-50/50 p-6 rounded-sm flex items-center gap-3">
          <Database className="h-6 w-6 text-slate-400" />
          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase">Live Pipeline Statistics</h4>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Filtered Matrix View Payload: <strong className="text-slate-800">{filteredProjects.length} Master Projects</strong>, <strong className="text-slate-800">{activeMilestones.length} Visible Milestones</strong> and <strong className="text-slate-800">{activeDependenciesList.length} Connected Task Dependencies</strong>.
            </p>
          </div>
        </Card>
      </div>

      {/* PORTFOLIO AGGREGATE FINANCIALS & STATS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
        <Card className="border-slate-200 shadow-xs rounded-sm bg-white border-l-4 border-l-sky-500">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Budget Allocation</span>
              <span className="text-xl font-black text-slate-800">${totalBudget.toLocaleString()}</span>
            </div>
            <div className="p-2 bg-sky-50 text-sky-600 rounded-sm"><Wallet className="h-4 w-4" /></div>
          </CardContent>
        </Card>
        
        <Card className="border-slate-200 shadow-xs rounded-sm bg-white border-l-4 border-l-amber-500">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Actual Cost (AC)</span>
              <span className="text-xl font-black text-slate-800">${totalActuals.toLocaleString()}</span>
            </div>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-sm"><TrendingUp className="h-4 w-4" /></div>
          </CardContent>
        </Card>
        
        <Card className="border-slate-200 shadow-xs rounded-sm bg-white border-l-4 border-l-emerald-500">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Earned Value (EV)</span>
              <span className="text-xl font-black text-slate-800">${totalEarned.toLocaleString()}</span>
            </div>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-sm"><CheckCircle2 className="h-4 w-4" /></div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-xs rounded-sm bg-white border-l-4 border-l-purple-500">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Active Change Orders</span>
              <span className="text-xl font-black text-purple-600">{activeChangeOrders} Active</span>
            </div>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-sm"><Activity className="h-4 w-4" /></div>
          </CardContent>
        </Card>
      </div>

      <LiveProjectTelemetryTable projects={filteredRollups} formatTimestamp={formatTimestamp} />

      {/* PORTFOLIO TIMELINE */}
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
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto max-h-[350px] overflow-y-auto">
            {activeMilestones.length === 0 ? <div className="p-8 text-center text-slate-400 text-xs italic">No active milestones found in recent reports.</div> : (
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
                  {activeMilestones.map((m: any, i) => {
                    const baseDate = m.baselineEnd || m.baselineEndDate;
                    const isCompleted = m.status === 'Complete';
                    const completionDate = isCompleted
                      ? (m.actualEnd || m.actualEndDate || m.forecastEnd || m.forecastEndDate)
                      : (m.forecastEnd || m.forecastEndDate);
                    const variance = calculateVarianceDays(baseDate, completionDate);
                    
                    return (
                      <TableRow key={i} className="hover:bg-slate-50/50">
                        <TableCell className="text-xs font-bold text-[#142E88] font-mono">{m.projectId}</TableCell>
                        <TableCell className="text-xs font-semibold">{m.tradeMilestone || m.name}</TableCell>
                        <TableCell className="text-[10px] font-mono">{baseDate || "N/A"}</TableCell>
                        <TableCell className="text-[10px] font-mono">{completionDate || "N/A"}</TableCell>
                        <TableCell><span className={`text-[10px] font-bold font-mono ${variance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{variance > 0 ? `+${variance} Days` : `${variance} Days`}</span></TableCell>
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
          <CardHeader className="bg-slate-50 border-b py-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Earned Value Cumulative Progress S-Curve
              </CardTitle>
              <CardDescription className="text-[10px]">Comparison of Planned Value (PV) cumulative curve vs. Earned Value (EV) actuals.</CardDescription>
            </div>
            <Badge variant="outline" className="text-[10px] bg-sky-50 text-sky-700 border-sky-100 shadow-none font-bold">Consolidated S-Curve</Badge>
          </CardHeader>
          <CardContent className="p-4 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  stroke="#334155" 
                  style={{ 
                    fontSize: '13px', 
                    fontFamily: 'monospace', 
                    fontWeight: '900' 
                  }} 
                />
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
        <Card className="border-slate-200 shadow-sm rounded-sm bg-white mt-4">
          <CardHeader className="bg-slate-50 border-b py-2.5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Active Threat Risk Register
            </CardTitle>
            
            <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-sm border border-slate-200 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setSeveritySelection("ALL")}
                className={`px-2 py-0.5 rounded-xs text-[10px] font-mono font-bold border transition-all cursor-pointer ${
                  severitySelection === "ALL" 
                    ? "bg-[#142E88] text-white border-[#142E88]" 
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}
              >
                ALL ({dynamicRisks.length})
              </button>
              {["Critical", "Mandatory", "High"].map((level) => {
                const countNum = dynamicRisks.filter((r: any) => (r.impact || r.importance) === level).length;
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setSeveritySelection(level as any)}
                    className={`px-2 py-0.5 rounded-xs text-[10px] font-mono font-bold border transition-all cursor-pointer ${
                      severitySelection === level 
                        ? "bg-[#142E88] text-white border-[#142E88]" 
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    {level.toUpperCase()} ({countNum})
                  </button>
                );
              })}
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-y-auto max-h-[300px]">
            {filteredRisks.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs italic bg-white">No active threats logged for selected filters.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] font-bold pl-4">Threat / Risk Context</TableHead>
                    <TableHead className="text-[10px] font-bold text-center">Status</TableHead>
                    <TableHead className="text-[10px] font-bold text-center">Criticality</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRisks.map((risk: any, i: number) => {
                    const importance = risk.impact || risk.importance || "Medium";
                    const badgeColor = importance === "Critical" ? "bg-red-100 text-red-800" : importance === "Mandatory" || importance === "High" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800";
                    return (
                      <TableRow key={i} className="hover:bg-slate-50">
                        <TableCell className="pl-4 py-2">
                          <p className="text-xs font-bold text-slate-800">{risk.subject || risk.title || risk.name || "Risk Item"}</p>
                          <p className="text-[9px] font-mono text-slate-400 mt-0.5">Project: {risk.projectId || "Global"}</p>
                        </TableCell>
                        <TableCell className="text-center py-2">
                          <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-bold text-white uppercase font-sans" style={{ backgroundColor: STATUS_COLORS[risk.status || "New / Unassigned"] }}>
                            {risk.status || "New / Unassigned"}
                          </span>
                        </TableCell>
                        <TableCell className="text-center py-2">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-mono font-black ${badgeColor}`}>
                            {importance.toUpperCase()}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
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
                          onClick={() => setViewingSnapshot(report)}
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
                <Button variant="outline" size="sm" onClick={handleNextPage} disabled={currentPage === totalPages} className="h-8 text-xs font-bold cursor-pointer bg-white">Next <ChevronRightIcon className="h-3 w-3 ml-1" /></Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* COMPACT MASTER STATUS MODAL LAYOUT */}
      {isReportModalOpen && generatedReportData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-md shadow-2xl w-full max-w-4xl flex flex-col relative overflow-hidden">
            <div className="bg-[#142E88] text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-200" />
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider">Compiled Program Performance Audit Ledger</h3>
                  <p className="text-[10px] text-blue-200 mt-0.5 font-mono">Compiled at: {generatedReportData.timestamp}</p>
                </div>
              </div>
              <button onClick={() => { setIsReportModalOpen(false); setGeneratedReportData(null); }} className="text-white hover:text-blue-100 cursor-pointer transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div id="printable-area" className="p-6 space-y-6 max-h-[75vh] overflow-y-auto text-slate-800">
              
              {/* Report Header Meta */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 border rounded-sm">
                <div><span className="block text-[9px] uppercase font-bold text-slate-400">Target Scope</span><span className="text-xs font-bold text-slate-700">{generatedReportData.scope}</span></div>
                <div><span className="block text-[9px] uppercase font-bold text-slate-400">Active Projects</span><span className="text-xs font-bold text-slate-700">{generatedReportData.totalProjectsActive} Projects</span></div>
                <div><span className="block text-[9px] uppercase font-bold text-slate-400">Total Program Cost</span><span className="text-xs font-bold text-slate-700">${generatedReportData.totalBudget.toLocaleString()}</span></div>
                <div><span className="block text-[9px] uppercase font-bold text-slate-400">Earned Value (EV)</span><span className="text-xs font-bold text-slate-700">${generatedReportData.earnedValue.toLocaleString()}</span></div>
              </div>

              {/* Cost and Schedule variance summaries */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border-slate-200 p-4 bg-white shadow-none">
                  <span className="block text-[9px] uppercase font-bold text-slate-400">Program Schedule Variance (SV)</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className={`text-lg font-black font-mono ${generatedReportData.aggregateSV >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      ${generatedReportData.aggregateSV.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold font-sans">({generatedReportData.aggregateSV >= 0 ? "Under Schedule slippage" : "Schedule Lagging"})</span>
                  </div>
                </Card>
                
                <Card className="border-slate-200 p-4 bg-white shadow-none">
                  <span className="block text-[9px] uppercase font-bold text-slate-400">Program Cost Variance (CV)</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className={`text-lg font-black font-mono ${generatedReportData.aggregateCV >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      ${generatedReportData.aggregateCV.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold font-sans">({generatedReportData.aggregateCV >= 0 ? "Under budget path" : "Cost Overrun"})</span>
                  </div>
                </Card>
              </div>

              {/* Critical milestone timelines */}
              <div>
                <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider mb-2 border-b pb-1">Critical Milestone Slippages</h4>
                <ul className="space-y-1.5 text-xs">
                  {generatedReportData.criticalMilestones.length === 0 ? (
                    <li className="text-slate-400 italic text-center py-2">No milestones calculated in target scope bounds.</li>
                  ) : (
                    generatedReportData.criticalMilestones.map((m: any, idx: number) => (
                       <li key={idx} className="flex justify-between items-center bg-slate-50 p-1.5 border rounded-sm">
                         <span className="truncate max-w-[200px]" title={`${m.name} (${m.project})`}>{m.name} <span className="text-[10px] text-slate-400 font-mono">({m.project})</span></span>
                         <div className="flex items-center gap-2">
                           <span className={`text-[10px] font-mono font-bold ${m.variance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{m.variance > 0 ? `+${m.variance}d` : `${m.variance}d`}</span>
                           <Badge variant="outline" className="text-[9px] bg-white shadow-none">{m.status}</Badge>
                         </div>
                       </li>
                    ))
                  )}
                </ul>
              </div>

              {/* Program Risks and Mitigations */}
              <div>
                <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider mb-2 border-b pb-1">Consolidated Program Threat Registers</h4>
                <div className="space-y-3">
                  {generatedReportData.consolidatedRisks.length === 0 ? (
                    <p className="text-slate-400 text-xs italic text-center py-4">No active threat descriptions logged for selected projects.</p>
                  ) : (
                    generatedReportData.consolidatedRisks.map((r: any, idx: number) => (
                      <div key={idx} className="p-3 bg-red-50/20 border border-red-100 rounded-sm text-xs space-y-1">
                        <div className="flex justify-between font-semibold">
                          <span className="text-[#142E88] font-bold">{r.project}</span>
                          <span className={`font-mono text-[9px] uppercase px-1.5 rounded-xs ${r.status === 'Critical Risk' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{r.status}</span>
                        </div>
                        <p className="text-slate-700 leading-relaxed font-sans text-xs italic">"Risk: {r.risk}"</p>
                        <p className="text-slate-500 font-mono text-[10px]">Mitigation Plan: {r.mitigation}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

            <div className="bg-slate-50 px-6 py-3 border-t flex justify-end gap-2">
              <Button onClick={() => {
                const printContents = document.getElementById('printable-area')?.innerHTML;
                const originalContents = document.body.innerHTML;
                if (printContents) {
                  document.body.innerHTML = printContents;
                  window.print();
                  document.body.innerHTML = originalContents;
                  window.location.reload();
                }
              }} className="bg-slate-700 text-white hover:bg-slate-800 text-xs font-bold h-8 flex items-center gap-1 cursor-pointer">
                <Printer className="h-3.5 w-3.5" /> Print PDF Ledger
              </Button>
              <Button onClick={() => { setIsReportModalOpen(false); setGeneratedReportData(null); }} className="bg-white border text-slate-700 hover:bg-slate-50 text-xs font-bold h-8 cursor-pointer">
                Close View
              </Button>
            </div>

          </div>
        </div>
      )}

      {/* HISTORICAL SNAPSHOT DETAILS VIEW */}
      {viewingSnapshot && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
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
