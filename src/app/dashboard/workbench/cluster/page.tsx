// File: src/app/dashboard/workbench/cluster/page.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, doc, updateDoc } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider"; 
import { ShieldAlert, ExternalLink, Users, Layers, Calendar, RefreshCw } from "lucide-react";
import { kmeans } from "ml-kmeans";

// Agnostic Operational Parametric Normalization Weights
const PROBABILITY_WEIGHTS: Record<number, number> = { 4: 1.0, 3: 0.75, 2: 0.50, 1: 0.25, 0: 0.0 };
const IMPACT_WEIGHTS: Record<string, number> = { Critical: 1.0, Mandatory: 0.8, High: 0.6, Medium: 0.4, Low: 0.2, "N/A": 0.0 };

// Reverse lookups for axis tick rendering labels
const PROBABILITY_TICKS = [0, 1, 2, 3, 4];
const IMPORTANCE_TICKS = ["Low", "Medium", "High", "Mandatory", "Critical"];

const ROAM_CATEGORIES = ["New / Unassigned", "Owned", "Mitigated", "Accepted", "Resolved"];
const PROBABILITY_LEVELS = [0, 1, 2, 3, 4];
const IMPORTANCE_LEVELS = ["Critical", "Mandatory", "High", "Medium", "Low", "N/A"];

// Lifecycle Management Explicit Status Color System
const STATUS_COLORS: Record<string, string> = {
  Resolved: "#10B981",   // Green 🟢
  Accepted: "#3B82F6",   // Blue 🔵
  Mitigated: "#883AE1",  // Purple 🟣
  Owned: "#1A2D83",      // Brand Dark Blue 🔮
  "New / Unassigned": "#EF4444", // Red 🔴
  New: "#EF4444",        
  Open: "#EF4444",       
  WIP: "#F59E0B",        
  "On Hold": "#64748B",
  Withdrawn: "#94A3B8"
};

export default function RiskClusterDashboard() {
  const [raidqItems, setRaidqItems] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [commentText, setCommentText] = useState("");
  const [daysHorizon, setDaysHorizon] = useState<number>(90);
  const [isSyncing, setIsSyncing] = useState(false);

  // THE TRIGGER FUNCTION FOR FIELD OBSERVATIONS PIPELINE
  const handleTriggerAiSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/analyze-raid", { method: "POST" });
      const data = await res.json();
      alert(`AI Sync Complete! Processed ${data.processedCount || 0} field observations strictly as Risks.`);
    } catch (err) {
      console.error(err);
      alert("Failed to connect to the AI processing pipeline.");
    } finally {
      setIsSyncing(false);
    }
  };

  // LIVE FIRESTORE STREAM DATA SYNC HOOK
  useEffect(() => {
    const q = query(collection(db, "raid_matrix"));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRaidqItems(items);
      
      if (selectedItem) {
        const freshTarget = items.find(i => i.id === selectedItem.id);
        if (freshTarget) setSelectedItem(freshTarget);
      }
    });
    return () => unsub();
  }, [selectedItem]);

  // Filter items dynamically by time horizon
  const filteredTimelineItems = useMemo(() => {
    const now = new Date();
    return raidqItems.filter(item => {
      const createdDate = item.createdAt ? new Date(item.createdAt) : new Date();
      const diffTime = Math.abs(now.getTime() - createdDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= daysHorizon;
    });
  }, [raidqItems, daysHorizon]);

  // Compute Coordinate Mapping
  const clusteredData = useMemo(() => {
    if (filteredTimelineItems.length === 0) return [];

    const vectors = filteredTimelineItems.map(item => [
      IMPACT_WEIGHTS[item.importance] || IMPACT_WEIGHTS[item.impactLevel] || 0.2, 
      PROBABILITY_WEIGHTS[Number(item.probability)] || 0.0
    ]);

    return filteredTimelineItems.map((item, idx) => ({
      ...item,
      x: vectors[idx][0],
      y: vectors[idx][1],
      nodeColor: STATUS_COLORS[item.roamCategory] || STATUS_COLORS[item.status] || "#EF4444"
    }));
  }, [filteredTimelineItems]);

  const handleUpdateParam = async (field: string, value: any) => {
    if (!selectedItem) return;
    try {
      const docRef = doc(db, "raid_matrix", selectedItem.id);
      const patches: Record<string, any> = { [field]: value };
      if (field === "roamCategory") {
        patches.status = value === "New / Unassigned" ? "Identified" : value;
      }
      await updateDoc(docRef, patches);
    } catch (err) {
      console.error("Failed to commit matrix updates:", err);
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
      console.error("Failed to append historical comment log:", err);
    }
  };

  return (
    <div className="max-w-[1700px] mx-auto px-6 py-6 space-y-6 bg-[#F8FAFC] text-slate-900 min-h-screen font-sans">
      
      {/* HEADER CONTROL BANNER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-slate-200 pb-5 gap-4">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-[#142E88]" />
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">Workbench Risk Exposure Workspace</h1>
            <p className="text-xs text-slate-500 font-mono">Dynamic Probability & Impact Registry</p>
          </div>
        </div>

        {/* INTEGRATED TIME HORIZON & AI SYNC CONSOLE MATRIX */}
        <div className="flex items-center gap-4 bg-white p-2 border border-slate-200 rounded-sm shadow-xs min-w-[480px]">
          <Button 
            type="button"
            onClick={handleTriggerAiSync}
            disabled={isSyncing}
            className="bg-[#142E88] hover:bg-blue-800 text-white font-bold h-10 px-3 rounded-none text-[10px] uppercase tracking-wider font-mono flex items-center gap-1.5 shadow-none shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? "Syncing..." : "Sync Logs"}
          </Button>

          <div className="h-6 w-px bg-slate-200 shrink-0" />

          <div className="flex-1 flex items-center gap-3 pr-2">
            <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
            <div className="flex-1 space-y-1">
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                <span>Time Horizon Filter</span>
                <span className="text-[#142E88] font-black">{daysHorizon} Days</span>
              </div>
              <Slider value={[daysHorizon]} onValueChange={(val) => setDaysHorizon(val[0])} min={7} max={180} step={1} className="cursor-pointer" />
            </div>
          </div>
        </div>
      </div>

      {/* CORE DISPLAY MATRIX GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6">
        
        <div className="space-y-6">
          {/* THE CANVAS SCATTER GRID CHART */}
          <Card className="rounded-none border-slate-200 bg-white shadow-xs relative">
            <CardHeader className="border-b border-slate-100 py-3 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <CardTitle className="text-xs font-bold font-mono uppercase tracking-wider text-slate-600 flex items-center gap-2">
                <Layers className="h-4 w-4 text-slate-400" /> Dynamic Risk Scatter Mapping Grid
              </CardTitle>
              
              {/* 🟢 NEW VISUAL LEGEND SUB-ROW BAR */}
              <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono font-bold">
                <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#EF4444]" /> New / Unassigned</div>
                <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#1A2D83]" /> Owned</div>
                <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#883AE1]" /> Mitigated</div>
                <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#3B82F6]" /> Accepted</div>
                <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#10B981]" /> Resolved</div>
              </div>
            </CardHeader>
            <CardContent className="p-6 h-[540px]">

              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 30, bottom: 35, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  
                  {/* X-AXIS: IMPORTANCE (0.0 to 1.0 Internal Normalization Map) */}
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
                    label={{ value: "Risk Importance / Impact Vector ──>", position: "bottom", offset: 15, className: "font-mono text-[10px] font-black uppercase text-slate-400 tracking-wider" }}
                    className="font-mono text-[10px] font-bold text-slate-500"
                  />
                  
                  {/* Y-AXIS: PROBABILITY (0.0 to 1.0 Internal Normalization Map) */}
                  <YAxis 
                    type="number" 
                    dataKey="y" 
                    domain={[-0.05, 1.05]} 
                    tickLine={false}
                    axisLine={{ stroke: '#CBD5E1' }}
                    ticks={[0.0, 0.25, 0.50, 0.75, 1.0]}
                    tickFormatter={(val) => {
                      if (val === 0.0) return "0 (None)";
                      if (val === 0.25) return "1";
                      if (val === 0.50) return "2";
                      if (val === 0.75) return "3";
                      if (val === 1.0) return "4 (Critical)";
                      return "";
                    }}
                    label={{ value: "◄── Probability / Likelihood Rating", angle: -90, position: "insideLeft", offset: -5, className: "font-mono text-[10px] font-black uppercase text-slate-400 tracking-wider" }}
                    className="font-mono text-[10px] font-bold text-slate-500"
                  />
                  
                  <ZAxis type="number" range={[140, 160]} />
                  
                  <Tooltip 
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white border border-slate-200 p-2 text-xs font-mono rounded shadow-lg text-slate-800">
                            <p className="font-bold text-[#142E88]">{data.title}</p>
                            <p>State Status: {data.roamCategory || "New / Unassigned"}</p>
                            <p>Importance: {data.importance || "Not set"}</p>
                            <p>Probability: {data.probability !== undefined ? data.probability : "Not set"}</p>
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
                      const isSelected = selectedItem?.id === payload.id;
                      return (
                        <circle 
                          cx={cx} 
                          cy={cy} 
                          r={isSelected ? 11 : 8} 
                          fill={payload.nodeColor} 
                          stroke={isSelected ? "#000000" : "#FFFFFF"}
                          strokeWidth={2}
                          className="transition-all duration-150 cursor-pointer hover:scale-125 shadow-sm"
                        />
                      );
                    }}
                    onClick={(node) => setSelectedItem(node.payload)}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* DETAIL TRIAGE WORKSPACE SECTION VIEW PANEL */}
          {selectedItem && (
            <Card className="rounded-none border-slate-200 bg-white shadow-xs">
              <CardHeader className="border-b border-slate-200 py-3 bg-slate-50/50">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-[#142E88] flex justify-between items-center font-mono">
                  <span>Triage Management Console: {selectedItem.title}</span>
                  <span className="text-[10px] text-slate-400 font-normal">Analyzed: {new Date(selectedItem.analyzedAt || Date.now()).toLocaleDateString()}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6 text-xs font-mono">
                
                <div className="grid grid-cols-2 md:grid-cols-6 gap-4 border-b border-slate-200 bg-slate-50/50 p-4 border rounded-sm">
                  
                  <div className="space-y-1">
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">RAIDQ Type</span>
                    <select
                      value={selectedItem.classification || "Risk"}
                      onChange={(e) => handleUpdateParam("classification", e.target.value)}
                      className="w-full bg-white border border-slate-300 h-8 px-1 text-xs font-mono rounded-none focus:outline-none focus:border-[#142E88] cursor-pointer font-bold text-slate-800"
                    >
                      {["Risk", "Action", "Assumption", "Issue", "Decision", "Dependency", "Question"].map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Probability</span>
                    <select
                      value={selectedItem.probability !== undefined ? Number(selectedItem.probability) : 0}
                      onChange={(e) => handleUpdateParam("probability", Number(e.target.value))}
                      className="w-full bg-white border border-slate-300 h-8 px-1 text-xs font-mono rounded-none focus:outline-none focus:border-[#142E88] cursor-pointer text-slate-800"
                    >
                      {[0, 1, 2, 3, 4].map(num => (
                        <option key={num} value={num}>{num} / 4</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Importance</span>
                    <select
                      value={selectedItem.importance || selectedItem.impactLevel || "Medium"}
                      onChange={(e) => handleUpdateParam("importance", e.target.value)}
                      className="w-full bg-white border border-slate-300 h-8 px-1 text-xs font-mono rounded-none focus:outline-none focus:border-[#142E88] cursor-pointer text-slate-800"
                    >
                      {["Critical", "Mandatory", "High", "Medium", "Low", "N/A"].map(lvl => (
                        <option key={lvl} value={lvl}>{lvl}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Detectability</span>
                    <select
                      value={selectedItem.detectability || "Medium"}
                      onChange={(e) => handleUpdateParam("detectability", e.target.value)}
                      className="w-full bg-white border border-slate-300 h-8 px-1 text-xs font-mono rounded-none focus:outline-none focus:border-[#142E88] cursor-pointer text-slate-800"
                    >
                      {["High", "Medium", "Low", "N/A"].map(det => (
                        <option key={det} value={det}>{det}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">ROAM Category</span>
                    <select
                      value={selectedItem.roamCategory || "New / Unassigned"}
                      onChange={(e) => handleUpdateParam("roamCategory", e.target.value)}
                      className="w-full bg-white border border-slate-300 h-8 px-1 text-xs font-mono rounded-none focus:outline-none focus:border-[#142E88] cursor-pointer font-bold text-slate-800"
                    >
                      {["New / Unassigned", "Owned", "Mitigated", "Accepted", "Resolved"].map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Status Variant</span>
                    <select
                      value={selectedItem.status || "Identified"}
                      onChange={(e) => handleUpdateParam("status", e.target.value)}
                      className="w-full bg-white border border-slate-300 h-8 px-1 text-xs font-mono rounded-none focus:outline-none focus:border-[#142E88] cursor-pointer text-slate-800"
                    >
                      {["Identified", "Open", "WIP", "On Hold", "Resolved", "Withdrawn"].map(st => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </div>

                </div>

                <div className="space-y-1 text-[11px] border-b border-slate-100 pb-4">
                  <span className="text-slate-400 block text-[9px] uppercase font-bold">Field Inspector Observation Context</span>
                  <p className="text-slate-700 leading-relaxed bg-slate-50/50 p-3 border border-slate-100 font-sans">{selectedItem.description}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-6 pt-2">
                  <form onSubmit={handleCommitComment} className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Add Management Review Notes</label>
                    <Textarea 
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      placeholder="Commit audit adjustments or response logic tracks here..."
                      rows={3}
                      className="bg-slate-50 border-slate-200 text-xs text-slate-800 rounded-none focus:border-slate-300 shadow-none resize-none"
                    />
                    <Button type="submit" size="sm" className="bg-[#142E88] hover:bg-blue-800 text-white font-bold rounded-none text-[10px] font-mono uppercase tracking-wider">
                      Submit Response Comment
                    </Button>
                  </form>

                  <div className="flex flex-col h-[130px]">
                    <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Historical Comments</span>
                    <div className="flex-1 border border-slate-200 bg-slate-50 p-2 overflow-y-auto space-y-2 text-[10px] rounded-none">
                      {selectedItem.historicalComments?.map((c: any, cIdx: number) => (
                        <div key={cIdx} className="border-b border-slate-200 pb-1.5 last:border-0">
                          <div className="flex justify-between text-slate-400 font-bold mb-0.5 font-mono">
                            <span>{c.author}</span>
                            <span>{new Date(c.timestamp).toLocaleDateString()}</span>
                          </div>
                          <p className="text-slate-700 font-sans leading-tight">{c.text}</p>
                        </div>
                      ))}
                      {(!selectedItem.historicalComments || selectedItem.historicalComments.length === 0) && (
                        <span className="text-slate-400 italic block text-center pt-8 font-mono">No historical notes logs recorded.</span>
                      )}
                    </div>
                  </div>
                </div>

              </CardContent>
            </Card>
          )}
        </div>

        {/* RIGHT INDEX PANEL (DYNAMIC REGISTRY INDEX) */}
        <Card className="rounded-none border-slate-200 bg-white shadow-xs h-[715px] flex flex-col">
          <CardHeader className="border-b border-slate-100 py-4 bg-slate-50/60 shrink-0">
            <div className="flex items-center gap-2 text-slate-700">
              <Users className="h-4 w-4 text-[#142E88]" />
              <div>
                <CardTitle className="text-xs font-bold uppercase tracking-wider font-mono text-slate-700">Active Risk Registry Index</CardTitle>
                <CardDescription className="text-[10px] text-slate-400 font-mono font-medium">
                  {clusteredData.length} active logs within scope bounds
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3 overflow-y-auto flex-1 space-y-2 bg-slate-50/20">
            {clusteredData.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className={`p-3 border font-mono text-[11px] cursor-pointer transition-all flex flex-col gap-1.5 rounded-none ${
                  selectedItem?.id === item.id 
                    ? 'border-[#142E88] bg-blue-50/50 shadow-xs' 
                    : 'border-slate-200 bg-white hover:border-slate-400'
                }`}
              >
                <div className="flex justify-between items-start gap-2">
                  <span className="font-bold text-slate-800 truncate max-w-[210px]">{item.title}</span>
                  <span 
                    className="h-2 w-2 rounded-full mt-1.5 shrink-0" 
                    style={{ backgroundColor: item.nodeColor }}
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-400">
                  <span>State: <strong className="text-slate-600 font-bold">{item.roamCategory || "Unassigned"}</strong></span>
                  <span>Impact: <strong className="text-slate-600 font-bold">{item.importance || "N/A"}</strong></span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}