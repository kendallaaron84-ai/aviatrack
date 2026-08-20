// File: src/app/dashboard/workbench/cluster/page.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";
import { auth, db } from "@/lib/firebase";
import { collection, onSnapshot, query, doc, updateDoc, addDoc, getDocs, where } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ShieldAlert, RefreshCw, Layers, Users, Calendar, Filter, Download } from "lucide-react";
import { createProjectNameMap, normalizeRaidProbability, RAID_OWNERSHIP_COLORS, resolveProjectName, resolveRaidOwnershipState } from "@/lib/raid-display-utils";

// Operational Parametric Normalization Weights
const PROBABILITY_WEIGHTS: Record<number, number> = { 4: 1.0, 3: 0.75, 2: 0.50, 1: 0.25, 0: 0.0 };
const IMPACT_WEIGHTS: Record<string, number> = { Critical: 1.0, Mandatory: 0.8, High: 0.6, Medium: 0.4, Low: 0.2, "N/A": 0.0 };

const generateSearchTags = (item: any, additionalPatches: Record<string, any> = {}) => {
  const merged = { ...item, ...additionalPatches };
  const textPool = [
    merged.title || "",
    merged.description || "",
    merged.classification || "",
    merged.roamCategory || "",
    merged.status || "",
    merged.projectId || "",
    merged.owner || ""
  ].join(" ").toLowerCase();
  
  const words = textPool.split(/[\s,.;:!?()"/#&\-_]+/).filter(w => w.length > 1);
  return Array.from(new Set(words));
};

export default function RiskClusterDashboard() {
  const [raidqItems, setRaidqItems] = useState<any[]>([]);
  const [projectNames, setProjectNames] = useState<Map<string, string>>(new Map());
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [commentText, setCommentText] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [migrationResult, setMigrationResult] = useState<any>(null);
  const [dedupeDryRunResult, setDedupeDryRunResult] = useState<any>(null);
  const [isMigrationRunning, setIsMigrationRunning] = useState(false);
  const [showMigrationControls, setShowMigrationControls] = useState(false);

  // Filter Configuration States
  const [importanceFilter, setImportanceFilter] = useState<string>("ALL");
  const [fromDate, setFromDate] = useState<string>("");
  const [selectedProject, setSelectedProject] = useState<string>("ALL");
  const [toDate, setToDate] = useState<string>("");

  // Live stream records hook
  useEffect(() => {
    const q = query(collection(db, "raid_matrix"));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((item: any) => item.mergeStatus !== "MERGED");
      setRaidqItems(items);
    }, (error) => console.error("Firestore raid_matrix listener error:", error));
    return () => unsub();
  }, []);

  useEffect(() => {
    setShowMigrationControls(new URLSearchParams(window.location.search).get("raidNumberingMigration") === "1");
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "admin_projects"), snapshot => {
      setProjectNames(createProjectNameMap(snapshot.docs.map(document => ({ id: document.id, ...document.data() }))));
    }, error => console.error("Firestore admin_projects listener error:", error));
    return () => unsub();
  }, []);

  const resolvedItems = useMemo(() => raidqItems.map(item => {
    const ownershipState = resolveRaidOwnershipState(item);
    return {
      ...item,
      projectName: resolveProjectName(item.projectId, projectNames, item.projectName),
      ownershipState,
      probability: normalizeRaidProbability(item.probability),
    };
  }), [raidqItems, projectNames]);

  useEffect(() => {
    if (!selectedItem) return;
    const freshTarget = resolvedItems.find(item => item.id === selectedItem.id);
    if (freshTarget) setSelectedItem(freshTarget);
  }, [resolvedItems, selectedItem?.id]);

  // Comprehensive Date & Importance Filter Engine
  const filteredItems = useMemo(() => {
  return resolvedItems.filter(item => {
    if (importanceFilter !== "ALL" && item.importance !== importanceFilter) return false;

    // 🆕 PROJECT CLASSIFICATION FILTER CHECK
    if (selectedProject !== "ALL" && item.projectId !== selectedProject) return false;

    if (item.createdAt) {
      const timestamp = new Date(item.createdAt);
      if (fromDate && timestamp < new Date(fromDate + "T00:00:00")) return false;
      if (toDate && timestamp > new Date(toDate + "T23:59:59")) return false;
    }
    return true;
  });
}, [resolvedItems, importanceFilter, fromDate, toDate, selectedProject]);

  // Compute live contextual counts based on complete backend query snapshot
  const importanceCounts = useMemo(() => {
    const counts: Record<string, number> = { Critical: 0, Mandatory: 0, High: 0, Medium: 0, Low: 0 };
    resolvedItems.forEach(item => {
      if (counts[item.importance] !== undefined) {
        counts[item.importance]++;
      }
    });
    return counts;
  }, [resolvedItems]);

  // Coordinate Data Mapping normalizer
  const clusteredData = useMemo(() => {
    return filteredItems.map(item => ({
      ...item,
      x: IMPACT_WEIGHTS[item.importance] || 0.2, 
      y: PROBABILITY_WEIGHTS[item.probability],
      nodeColor: RAID_OWNERSHIP_COLORS[resolveRaidOwnershipState(item)]
    }));
  }, [filteredItems]);

  const projectOptions = useMemo(() => [...new Map(
    resolvedItems
      .filter(item => item.projectId)
      .map(item => [item.projectId, item.projectName]),
  ).entries()].sort((left, right) => String(left[1]).localeCompare(String(right[1]))), [resolvedItems]);

  // AI Sync Log ingestion with query deduplication defenses
  const handleTriggerAiSync = async () => {
    setIsSyncing(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Authentication required.");
      const res = await fetch("/api/analyze-raid", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "RAID ingestion failed.");
      setSyncResult(data);
      alert(`AI Ingestion Pipeline Executed. Processed: ${data.processedCount || 0}; Created: ${data.createdCount || 0}; Merged: ${data.mergedCount || 0}; Skipped: ${data.skippedCount || 0}; Errors: ${data.errorCount || 0}.`);
    } catch (err) {
      console.error(err);
      alert("Failed to safely establish background pipeline tunnel.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRaidNumberingMigration = async (mode: "dry-run" | "apply") => {
    setIsMigrationRunning(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Authentication required.");
      const response = await fetch("/api/raid-numbering", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "RAID numbering migration failed.");
      setMigrationResult(data);
    } catch (error: any) {
      setMigrationResult({ error: error.message });
    } finally {
      setIsMigrationRunning(false);
    }
  };

  const handleDedupeDryRun = async () => {
    setIsMigrationRunning(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Authentication required.");
      const response = await fetch("/api/raid-deduplicate", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "dry-run" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "RAID deduplication dry-run failed.");
      setDedupeDryRunResult(data);
    } catch (error: any) {
      setDedupeDryRunResult({ error: error.message });
    } finally {
      setIsMigrationRunning(false);
    }
  };

  // State Patch updates with Integrated Audit Trail tracking arrays
  const handleUpdateParam = async (field: string, value: any) => {
    if (!selectedItem) return;
    try {
      const docRef = doc(db, "raid_matrix", selectedItem.id);
      
      // Constructing historical audit record snapshot
      const currentAuditRecord = {
        previousClassification: selectedItem.classification || "Risk",
        previousProbability: selectedItem.probability !== undefined ? selectedItem.probability : 0,
        previousImportance: selectedItem.importance || "Medium",
        previousOwner: selectedItem.assignedOwner || selectedItem.owner || "Unassigned",
        modifiedField: field,
        oldValue: selectedItem[field] || "None",
        newValue: value,
        timestamp: new Date().toISOString(),
        operator: "Program Manager"
      };

      const existingAuditTrail = selectedItem.auditTrailHistory || [];
      const updatedAuditTrail = [currentAuditRecord, ...existingAuditTrail];

      const patches: Record<string, any> = { 
        [field]: value,
        auditTrailHistory: updatedAuditTrail
      };
      
      if (field === "roamCategory") {
        patches.status = value === "New / Unassigned" ? "Identified" : value;
      }
      
      patches.search_tags = generateSearchTags(selectedItem, patches);
      await updateDoc(docRef, patches);
    } catch (err) {
      console.error("Meticulous change logging fault:", err);
    }
  };

  const handleCommitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !selectedItem) return;

    try {
      const commentLog = {
        text: commentText,
        timestamp: new Date().toISOString(),
        author: "Program Manager"
      };
      const updatedHistory = [...(selectedItem.historicalComments || []), commentLog];
      await updateDoc(doc(db, "raid_matrix", selectedItem.id), { historicalComments: updatedHistory });
      setCommentText("");
    } catch (err) {
      console.error("Failed to append note tracks:", err);
    }
  };

  // 📥 POINT-IN-TIME COMPLIANCE EXPORT ENGINE FOR AC-44 VALUE FIELDS
  const handleExportRiskRegisterCSV = () => {
    if (filteredItems.length === 0) {
      alert("No active risk registry logs available in the current scope to export.");
      return;
    }

    const headers = [
      "RAID ID", "Project ID", "Project Name", "Date Created", "Title", "Description", "Comments", "RAIDQ Type",
      "Probability", "Importance", "Assigned Owner", "ROAM Category / Ownership State",
      "Observation Abstract Context", "Historical Triage Notes"
    ];

    const rows = filteredItems.map(item => {
      // Safely aggregate array elements into unified multi-line cell text for Excel parsing
      const formattedNotesLog = item.historicalComments
        ? item.historicalComments.map((c: any) => `[${c.author} - ${new Date(c.timestamp).toLocaleDateString()}]: ${c.text}`).join(" | ")
        : "";

      return [
        item.raidNumber || item.id,
        item.projectId || "Unassigned",
        item.projectName,
        item.createdAt || "",
        (item.title || "").replace(/"/g, '""'),
        (item.description || "").replace(/"/g, '""'),
        formattedNotesLog.replace(/"/g, '""'),
        item.classification || "Risk",
        normalizeRaidProbability(item.probability) + " / 4",
        item.importance || "Medium",
        item.assignedOwner || item.owner || "Unassigned",
        item.ownershipState,
        (item.description || "").replace(/"/g, '""'),  // Maps abstract context
        formattedNotesLog.replace(/"/g, '""')         // Maps triage notes history
      ];
    });

    const csvContent = [headers.join(","), ...rows.map(e => `"${e.join('","')}"`)].join("\n");
    const csvBlob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(csvBlob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `Risk_Register_Snapshot_${selectedProject !== "ALL" ? selectedProject : "Master"}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  };

  return (
    <div className="max-w-[1700px] mx-auto px-6 py-6 space-y-6 bg-[#F8FAFC] text-slate-900 min-h-screen font-sans">
      
      {/* RENAME TARGET: WORKBENCH RISK REGISTER HEADER CONTROL BANNER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-slate-200 pb-5 gap-4">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-[#142E88]" />
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">Workbench Risk Register</h1>
            <p className="text-xs text-slate-500 font-mono">Deduplicated Probability & Impact Management Console</p>
          </div>
        </div>

        {/* TIME HORIZON TO - FROM CALENDAR DATES FILTER MODULE */}
        <div className="flex flex-wrap items-center gap-4 bg-white p-3 border border-slate-200 rounded-sm shadow-xs font-mono text-xs">
          <Button 
            type="button"
            onClick={handleTriggerAiSync}
            disabled={isSyncing}
            className="bg-[#142E88] hover:bg-blue-800 text-white font-bold h-9 px-3 rounded-none text-[10px] uppercase tracking-wider flex items-center gap-1.5 shrink-0"
          >
            <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
            Sync Logs
          </Button>

          {/* 🆕 ACCEPTS SNAPSHOT ACTION TARGET CLICK HOOK */}
          <Button 
            type="button"
            onClick={handleExportRiskRegisterCSV}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9 px-3 rounded-none text-[10px] uppercase tracking-wider flex items-center gap-1.5 shrink-0"
          >
            <Download className="h-3 w-3" />
            Export CSV
          </Button>

          <div className="hidden sm:block h-6 w-px bg-slate-200 shrink-0" />

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase">From:</span>
            <input 
              type="date" 
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="border border-slate-200 px-2 py-1 text-slate-700 bg-white focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase">To:</span>
            <input 
              type="date" 
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="border border-slate-200 px-2 py-1 text-slate-700 bg-white focus:outline-none"
            />
          </div>

          {(fromDate || toDate) && (
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={() => { setFromDate(""); setToDate(""); }}
              className="text-rose-500 hover:bg-rose-50 font-bold px-2 py-0 text-[10px]"
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {showMigrationControls && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-sm">One-Time RAID Numbering Migration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button disabled={isMigrationRunning} onClick={() => handleRaidNumberingMigration("dry-run")}>Run Dry-Run</Button>
              <Button disabled={isMigrationRunning || migrationResult?.mode !== "dry-run" || migrationResult?.duplicateRaidNumberCount !== 0} variant="destructive" onClick={() => handleRaidNumberingMigration("apply")}>Apply Verified Mapping</Button>
              <Button disabled={isMigrationRunning} variant="outline" onClick={handleDedupeDryRun}>Run Dedupe Dry-Run</Button>
            </div>
            {migrationResult && <pre className="max-h-80 overflow-auto border bg-slate-950 p-3 text-[10px] text-white">{JSON.stringify(migrationResult, null, 2)}</pre>}
            {syncResult && <pre data-testid="raid-sync-result" className="max-h-80 overflow-auto border bg-slate-950 p-3 text-[10px] text-white">{JSON.stringify(syncResult, null, 2)}</pre>}
            {dedupeDryRunResult && <pre className="max-h-80 overflow-auto border bg-slate-950 p-3 text-[10px] text-white">{JSON.stringify(dedupeDryRunResult, null, 2)}</pre>}
          </CardContent>
        </Card>
      )}

      {/* DYNAMIC FILTER ROW ACCUMULATOR CONTROL HOOKS */}
      <div className="flex flex-wrap items-center gap-2 bg-white p-3 border border-slate-200 rounded-sm">
        <span className="text-[10px] font-mono font-bold uppercase text-slate-400 mr-2 flex items-center gap-1">
          <Filter className="h-3 w-3" /> Importance Filters:
        </span>
        <select
          value={selectedProject}
          onChange={event => setSelectedProject(event.target.value)}
          className="border border-slate-200 bg-white px-2 py-1 text-[10px] font-mono text-slate-700"
          aria-label="Filter RAID items by project"
        >
          <option value="ALL">All Projects</option>
          {projectOptions.map(([projectId, projectName]) => <option key={projectId} value={projectId}>{projectName}</option>)}
        </select>
        <button
          onClick={() => setImportanceFilter("ALL")}
          className={`px-3 py-1 text-xs font-mono font-bold border transition-all ${
            importanceFilter === "ALL" ? "bg-[#142E88] text-white border-[#142E88]" : "bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300"
          }`}
        >
          All Items ({raidqItems.length})
        </button>
        {Object.keys(importanceCounts).map((lvl) => (
          <button
            key={lvl}
            onClick={() => setImportanceFilter(lvl)}
            className={`px-3 py-1 text-xs font-mono font-bold border transition-all ${
              importanceFilter === lvl ? "bg-[#142E88] text-white border-[#142E88]" : "bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300"
            }`}
          >
            {lvl} <span className="ml-1 opacity-70 font-black">({importanceCounts[lvl]})</span>
          </button>
        ))}
      </div>

      {/* CANVAS GRID SCATTER SPLIT LAYOUT */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6">
        
        <div className="space-y-6">
          {selectedItem && (
            <Card className="rounded-none border-slate-200 bg-white shadow-xs">
              <CardHeader className="border-b border-slate-200 py-3 bg-slate-50/50">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-[#142E88] flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 font-mono">
                  <span className="truncate max-w-xl">Triage Management Console: {selectedItem.title}</span>
                  
                  <div className="flex items-center gap-2 text-[10px] tracking-normal shrink-0">
                    <span className="bg-[#142E88] text-white px-2 py-0.5 font-sans font-bold rounded-xs">
                      PROJECT: {selectedItem.projectName}
                    </span>
                    <span className="text-slate-400">RAID ID: {selectedItem.raidNumber || selectedItem.id}</span>
                  </div>
                </CardTitle>
              </CardHeader>
            <CardContent className="p-6 h-[500px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 30, bottom: 35, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis 
                    type="number" 
                    dataKey="x" 
                    domain={[0, 1.05]} 
                    tickLine={false}
                    axisLine={{ stroke: '#CBD5E1' }}
                    ticks={[0.2, 0.4, 0.6, 0.8, 1.0]}
                    tickFormatter={(val) => {
                      if (val === 0.2) return "Low";
                      if (val === 0.4) return "Medium";
                      if (val === 0.6) return "High";
                      if (val === 0.8) return "Mandatory";
                      if (val === 1.0) return "Critical";
                      return "";
                    }}
                    className="font-mono text-[10px] text-slate-500"
                  />
                  <YAxis 
                    type="number" 
                    dataKey="y" 
                    domain={[-0.05, 1.05]} 
                    tickLine={false}
                    axisLine={{ stroke: '#CBD5E1' }}
                    ticks={[0.0, 0.25, 0.50, 0.75, 1.0]}
                    tickFormatter={(val) => {
                      if (val === 0.0) return "0";
                      if (val === 0.25) return "1";
                      if (val === 0.50) return "2";
                      if (val === 0.75) return "3";
                      if (val === 1.0) return "4";
                      return "";
                    }}
                    className="font-mono text-[10px] text-slate-500"
                  />
                  <ZAxis type="number" range={[140, 160]} />
                  <Tooltip 
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white border border-slate-200 p-2 text-xs font-mono shadow-lg text-slate-800">
                            <p className="font-bold text-[#142E88]">{data.raidNumber || data.id}</p>
                            <p>Title: {data.title}</p>
                            <p>RAIDQ Type: {data.classification || "Risk"}</p>
                            <p>Ownership State: {data.ownershipState}</p>
                            <p>Assigned Owner: {data.assignedOwner || data.owner || "Unassigned"}</p>
                            <p>Project ID: {data.projectId || "Unassigned"}</p>
                            <p>Project Name: {data.projectName}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Scatter 
                    data={clusteredData} 
                    shape={(props: any) => {
                      const { cx, cy, payload } = props;
                      const isSelected = selectedItem?.id === payload?.id;
                      return (
                        <circle 
                          cx={cx} 
                          cy={cy} 
                          r={isSelected ? 11 : 8} 
                          fill={payload.nodeColor} 
                          stroke={isSelected ? "#000000" : "#FFFFFF"}
                          strokeWidth={2}
                          className="cursor-pointer hover:scale-125 transition-transform"
                        />
                      );
                    }}
                    onClick={(node) => setSelectedItem(node.payload)}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          )}

          {selectedItem && (
            <Card className="rounded-none border-slate-200 bg-white shadow-xs">
              <CardHeader className="border-b border-slate-200 py-3 bg-slate-50/50">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-[#142E88] flex justify-between items-center font-mono">
                  <span>Triage Management Console: {selectedItem.title}</span>
                  <span className="text-[10px] text-slate-400">RAID ID: {selectedItem.raidNumber || selectedItem.id}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6 text-xs font-mono">
                
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 border-b border-slate-200 bg-slate-50/50 p-4 border rounded-sm">
                  
                  <div className="space-y-1">
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">RAIDQ Type</span>
                    <select
                      value={selectedItem.classification || "Risk"}
                      onChange={(e) => handleUpdateParam("classification", e.target.value)}
                      className="w-full bg-white border border-slate-300 h-8 px-1 text-xs font-mono rounded-none focus:outline-none"
                    >
                      {["Risk", "Action", "Assumption", "Issue", "Decision"].map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Probability</span>
                    <select
                      value={normalizeRaidProbability(selectedItem.probability)}
                      onChange={(e) => handleUpdateParam("probability", Number(e.target.value))}
                      className="w-full bg-white border border-slate-300 h-8 px-1 text-xs font-mono rounded-none focus:outline-none"
                    >
                      {[1, 2, 3, 4].map(num => (
                        <option key={num} value={num}>{num} / 4</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Importance</span>
                    <select
                      value={selectedItem.importance || "Medium"}
                      onChange={(e) => handleUpdateParam("importance", e.target.value)}
                      className="w-full bg-white border border-slate-300 h-8 px-1 text-xs font-mono rounded-none focus:outline-none"
                    >
                      {["Critical", "Mandatory", "High", "Medium", "Low", "N/A"].map(lvl => (
                        <option key={lvl} value={lvl}>{lvl}</option>
                      ))}
                    </select>
                  </div>

                  {/* 4.b INTEGRATED TRIAGE CARD COMPONENT OWNER ASSIGNMENT */}
                  <div className="space-y-1">
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Assigned Owner</span>
                    <select
                      value={selectedItem.assignedOwner || selectedItem.owner || "Unassigned"}
                      onChange={(e) => handleUpdateParam("assignedOwner", e.target.value)}
                      className="w-full bg-white border border-slate-300 h-8 px-1 text-xs font-mono rounded-none focus:outline-none font-bold text-[#142E88]"
                    >
                      {["Unassigned", "ITSD PM", "PMCM", "Others"].map(own => (
                        <option key={own} value={own}>{own}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">ROAM Category</span>
                    <select
                      value={selectedItem.ownershipState}
                      onChange={(e) => handleUpdateParam("roamCategory", e.target.value)}
                      className="w-full bg-white border border-slate-300 h-8 px-1 text-xs font-mono rounded-none focus:outline-none"
                    >
                      {Object.keys(RAID_OWNERSHIP_COLORS).map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                </div>

                {/* 3. CORE DISPLAY MATRIX FOR SYSTEM AUDIT TRAIL LOGS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-slate-100 pb-4">
                  <div className="space-y-1">
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Observation Abstract Context</span>
                    <p className="text-slate-700 leading-relaxed bg-slate-50 p-3 border border-slate-100 font-sans">{selectedItem.description}</p>
                  </div>
                  
                  <div className="space-y-1 flex flex-col">
                    <span className="text-rose-500 block text-[9px] uppercase font-bold tracking-wider">Historical Change Audit Trail</span>
                    <div className="flex-1 border border-amber-200 bg-amber-50/20 p-2 overflow-y-auto max-h-[110px] space-y-1.5 text-[10px]">
                      {selectedItem.auditTrailHistory?.map((audit: any, aIdx: number) => (
                        <div key={aIdx} className="border-b border-dashed border-slate-200 pb-1 last:border-0">
                          <p className="text-slate-500 font-bold">
                            [{new Date(audit.timestamp).toLocaleDateString()}] Field <span className="text-[#142E88]">"{audit.modifiedField}"</span> adjusted from <span className="text-slate-700 font-black">"{audit.oldValue}"</span> → <span className="text-emerald-700 font-black">"{audit.newValue}"</span>
                          </p>
                        </div>
                      ))}
                      {(!selectedItem.auditTrailHistory || selectedItem.auditTrailHistory.length === 0) && (
                        <span className="text-slate-400 italic block text-center pt-6">No historical structural corrections recorded.</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-6 pt-2">
                  <form onSubmit={handleCommitComment} className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Add Management Review Notes</label>
                    <Textarea 
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      placeholder="Commit audit adjustments or response logic tracks here..."
                      rows={2}
                      className="bg-slate-50 border-slate-200 text-xs rounded-none resize-none"
                    />
                    <Button type="submit" size="sm" className="bg-[#142E88] hover:bg-blue-800 text-white font-bold rounded-none text-[10px] uppercase font-mono">
                      Submit Comment
                    </Button>
                  </form>

                  <div className="flex flex-col h-[110px]">
                    <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Historical Triage Notes</span>
                    <div className="flex-1 border border-slate-200 bg-slate-50 p-2 overflow-y-auto space-y-2 text-[10px]">
                      {selectedItem.historicalComments?.map((c: any, cIdx: number) => (
                        <div key={cIdx} className="border-b border-slate-200 pb-1 last:border-0">
                          <div className="flex justify-between text-slate-400 font-bold mb-0.5">
                            <span>{c.author}</span>
                            <span>{new Date(c.timestamp).toLocaleDateString()}</span>
                          </div>
                          <p className="text-slate-700 font-sans leading-tight">{c.text}</p>
                        </div>
                      ))}
                      {(!selectedItem.historicalComments || selectedItem.historicalComments.length === 0) && (
                        <span className="text-slate-400 italic block text-center pt-6">No historical notes recorded.</span>
                      )}
                    </div>
                  </div>
                </div>

              </CardContent>
            </Card>
          )}
        </div>

        {/* RIGHT DYNAMIC REGISTRY SIDEBAR INDEX PANEL */}
        <Card className="rounded-none border-slate-200 bg-white shadow-xs h-[650px] flex flex-col">
          <CardHeader className="border-b border-slate-100 py-4 bg-slate-50/60 shrink-0">
            <div className="flex items-center gap-2 text-slate-700">
              <Users className="h-4 w-4 text-[#142E88]" />
              <div>
                <CardTitle className="text-xs font-bold uppercase tracking-wider font-mono text-slate-700">Active Risk Registry Index</CardTitle>
                <CardDescription className="text-[10px] text-slate-400 font-mono">
                  {filteredItems.length} active logs matching current filter scope
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3 overflow-y-auto flex-1 space-y-2 bg-slate-50/20">
            {clusteredData.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className={`p-3 border font-mono text-[11px] cursor-pointer transition-all flex flex-col gap-1.5 ${
                  selectedItem?.id === item.id 
                    ? 'border-[#142E88] bg-blue-50/50' 
                    : 'border-slate-200 bg-white hover:border-slate-400'
                }`}
              >
                <div className="flex justify-between items-start gap-2">
                  <span className="font-bold text-slate-800 truncate max-w-[210px]">{item.title}</span>
                  <span className="h-2 w-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: item.nodeColor }} />
                </div>

                {/* 🆕 INJECTED: PROJECT DISPLAY IDENTIFIER BADGE */}
                <div className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-xs font-sans font-semibold self-start tracking-tight border border-slate-200/60">
                  📁 {item.projectName}
                </div>

                <div className="flex justify-between items-center text-[10px] text-slate-400 pt-0.5">
                  <span>{item.raidNumber || item.id} · State: <strong className="text-slate-600">{item.ownershipState}</strong></span>
                  <span>Impact: <strong className="text-slate-600">{item.importance || "N/A"}</strong></span>
                </div>
                {(item.assignedOwner || item.owner) && (
                  <div className="text-[9px] bg-blue-900 text-white px-1.5 py-0.5 rounded-xs self-start font-black">
                    Owner: {item.assignedOwner || item.owner}
                  </div>
                )}
              </div>
            ))}
            {filteredItems.length === 0 && (
              <div className="text-center text-xs text-slate-400 italic pt-12">
                No data entries found within scope filters.
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
