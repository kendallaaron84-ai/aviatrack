// File: src/app/dashboard/portfolio/cluster/page.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, ReferenceLine, ResponsiveContainer, Tooltip } from "recharts";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, doc, updateDoc } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider"; // shadcn UI slider tool element
import { ShieldAlert, ExternalLink, Users, Layers, Calendar } from "lucide-react";
import { kmeans } from "ml-kmeans";

// Agnostic Operational Parametric Normalization Weights
const PROBABILITY_WEIGHTS: Record<number, number> = { 4: 1.0, 3: 0.75, 2: 0.50, 1: 0.25, 0: 0.0 };
const IMPACT_WEIGHTS: Record<string, number> = { Critical: 1.0, Mandatory: 0.85, High: 0.65, Medium: 0.45, Low: 0.25, "N/A": 0.0 };

// Lifecycle Management Explicit Status Color System
const STATUS_COLORS: Record<string, string> = {
  Resolved: "#10B981",   // Green 🟢
  Accepted: "#3B82F6",   // Blue 🔵
  Mitigated: "#883AE1",  // Purple 🟣
  Owned: "##1A2D83",      // Dark Blue 🔮
  New: "#EF4444",        // Red (Newly Created / Unassigned) 🔴
  Open: "#EF4444",       // Red 🔴
  WIP: "#F59E0B",        // Amber Tracker Fallback
  "On Hold": "#64748B",
  Withdrawn: "#94A3B8"
};

export default function SlatePortfolioClusterPage() {
  const [raidqItems, setRaidqItems] = useState<any[]>([]);
  const [governanceFilter, setGovernanceFilter] = useState<"ALL" | "IT_OWNED" | "LEADERSHIP">("ALL");
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [commentText, setCommentText] = useState("");
  
  // 📆 TIME HORIZON CONTROLLER STATE (Value indicates max age of items to show in days)
  const [daysHorizon, setDaysHorizon] = useState<number>(90);

  useEffect(() => {
    const q = query(collection(db, "raid_matrix"));
    const unsub = onSnapshot(q, (snap) => {
      setRaidqItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // Filter items dynamically by stakeholder ownership and time horizon
  const filteredTimelineItems = useMemo(() => {
    const now = new Date();
    
    return raidqItems.filter(item => {
      // 1. Governance Filter Guard
      if (governanceFilter === "IT_OWNED" && item.isItOwned !== true) return false;
      if (governanceFilter === "LEADERSHIP" && item.isItOwned !== false) return false;

      // 2. Time Horizon Clutter Guard
      const createdDate = item.createdAt ? new Date(item.createdAt) : new Date();
      const diffTime = Math.abs(now.getTime() - createdDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      return diffDays <= daysHorizon;
    });
  }, [raidqItems, governanceFilter, daysHorizon]);

  // Compute K-Means Client Side Coordinate Mapping
  const clusteredData = useMemo(() => {
    if (filteredTimelineItems.length === 0) return [];

    const vectors = filteredTimelineItems.map(item => [
      IMPACT_WEIGHTS[item.importance] || 0.4,
      PROBABILITY_WEIGHTS[item.probability] || 0.0
    ]);

    try {
      const kValue = Math.min(4, filteredTimelineItems.length);
      const kMeansResult = kmeans(vectors, kValue, {});
      
      return filteredTimelineItems.map((item, idx) => ({
        ...item,
        x: vectors[idx][0],
        y: vectors[idx][1],
        clusterIdx: kMeansResult.clusters[idx],
        // Node color is driven directly by management status, fallback to red for unassigned items
        nodeColor: STATUS_COLORS[item.roamCategory] || STATUS_COLORS[item.status] || "#EF4444"
      }));
    } catch (e) {
      return filteredTimelineItems.map((item, idx) => ({
        ...item, x: vectors[idx][0], y: vectors[idx][1], nodeColor: "#EF4444"
      }));
    }
  }, [filteredTimelineItems]);

  const handleCommitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !selectedItem) return;

    try {
      const commentLog = {
        text: commentText,
        timestamp: new Date().toISOString(),
        author: "Portfolio Lead"
      };
      const updatedHistory = [...(selectedItem.historicalComments || []), commentLog];
      await updateDoc(doc(db, "raid_matrix", selectedItem.id), { historicalComments: updatedHistory });
      setSelectedItem({ ...selectedItem, historicalComments: updatedHistory });
      setCommentText("");
    } catch (err) {
      console.error("Failed to append historical audit tracking log:", err);
    }
  };

  return (
    <div className="max-w-[1700px] mx-auto px-6 py-6 space-y-6 bg-[#F8FAFC] text-slate-900 min-h-screen font-sans">
      
      {/* HEADER CONTROL BANNER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-slate-200 pb-5 gap-4">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-[#142E88]" />
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">Portfolio RAIDQ Management Matrix</h1>
            <p className="text-xs text-slate-500 font-mono">Traceable Visual Risk Mapping Framework • KOBA-I Compliance Standard</p>
          </div>
        </div>

        {/* TIME HORIZON AND GOVERNANCE SLIDER FILTER RACK */}
        <div className="flex flex-col sm:flex-row items-center gap-6 bg-white p-3 border border-slate-200 rounded-sm shadow-xs">
          
          {/* HORIZON CONTROLLER */}
          <div className="flex items-center gap-3 min-w-[260px]">
            <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
            <div className="flex-1 space-y-1">
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                <span>Time Horizon Filter</span>
                <span className="text-[#142E88] font-black">{daysHorizon} Days</span>
              </div>
              <Slider 
                value={[daysHorizon]} 
                onValueChange={(val) => setDaysHorizon(val[0])} 
                min={7} 
                max={180} 
                step={1} 
                className="cursor-pointer"
              />
            </div>
          </div>

          {/* MASK FILTER OVERLAYS */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-sm border">
            <button onClick={() => setGovernanceFilter("ALL")} className={`px-3 py-1.5 text-[10px] font-bold font-mono tracking-tight uppercase transition-all rounded-xs ${governanceFilter === 'ALL' ? 'bg-[#142E88] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>All Combined</button>
            <button onClick={() => setGovernanceFilter("IT_OWNED")} className={`px-3 py-1.5 text-[10px] font-bold font-mono tracking-tight uppercase transition-all rounded-xs ${governanceFilter === 'IT_OWNED' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>IT Owned Scope</button>
            <button onClick={() => setGovernanceFilter("LEADERSHIP")} className={`px-3 py-1.5 text-[10px] font-bold font-mono tracking-tight uppercase transition-all rounded-xs ${governanceFilter === 'LEADERSHIP' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Leadership View</button>
          </div>
        </div>
      </div>

      {/* CORE DISPLAY MATRIX GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6">
        
        <div className="space-y-6">
          {/* THE CANVAS GRAPH COMPONENT SCATTER GRID */}
          <Card className="rounded-none border-slate-200 bg-white shadow-xs relative">
            <CardHeader className="border-b border-slate-100 py-3 bg-slate-50/60">
              <CardTitle className="text-xs font-bold font-mono uppercase tracking-wider text-slate-600 flex items-center gap-2">
                <Layers className="h-4 w-4 text-slate-400" /> K-Means Algorithmic Threat Space Model (ROAM Boundary Layout)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 relative h-[520px]">
              
              {/* BACKPLANE QUADRANT LABELS MATCHING WIREFRAME SCHEMATIC EXACTLY */}
              <div className="absolute inset-0 p-8 flex flex-col justify-between pointer-events-none text-[11px] font-mono font-black text-slate-400 tracking-widest z-0">
                <div className="flex justify-between"><span>Resolved</span><span>Accepted</span></div>
                <div className="flex justify-between"><span>Owned</span><span>Mitigated</span></div>
              </div>

              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 25, right: 25, bottom: 25, left: 25 }}>
                  <XAxis type="number" dataKey="x" domain={[0, 1.05]} hide />
                  <YAxis type="number" dataKey="y" domain={[0, 1.05]} hide />
                  <ZAxis type="number" range={[140, 160]} />
                  
                  {/* QUADRANT DIVISION THRESHOLDS */}
                  <ReferenceLine x={0.5} stroke="#EF4444" strokeWidth={1.5} />
                  <ReferenceLine y={0.5} stroke="#EF4444" strokeWidth={1.5} />
                  
                  <Tooltip 
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white border border-slate-200 p-2 text-xs font-mono rounded shadow-lg text-slate-800">
                            <p className="font-bold text-[#142E88]">{data.title}</p>
                            <p>Status: {data.roamCategory || data.status}</p>
                            <p>Importance: {data.importance}</p>
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
                          r={isSelected ? 10 : 7} 
                          fill={payload.nodeColor} 
                          stroke={isSelected ? "#000000" : "transparent"}
                          strokeWidth={2}
                          className="transition-all duration-150 cursor-pointer hover:scale-125"
                        />
                      );
                    }}
                    onClick={(node) => setSelectedItem(node.payload)}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* CONTEXT LOG DATA INTERVIEW PANEL (AUDIT LAYER) */}
          {selectedItem && (
            <Card className="rounded-none border-slate-200 bg-white shadow-xs">
              <CardHeader className="border-b border-slate-200 py-3 bg-slate-50/50">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-[#142E88] flex justify-between items-center font-mono">
                  <span>Risk Details Section: {selectedItem.title}</span>
                  <span className="text-[10px] text-slate-400 font-normal">Created: {new Date(selectedItem.createdAt || Date.now()).toLocaleDateString()}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6 text-xs font-mono">
                
                {/* GLOBAL AGNOSTIC ELEMENT METRIC VALUES MAPPED MANUALLY */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-4 border-b border-slate-100 pb-4">
                  <div><span className="text-slate-400 block text-[9px] uppercase font-bold">RAIDQ Type</span><strong className="text-slate-800 text-[11px]">{selectedItem.classification}</strong></div>
                  <div><span className="text-slate-400 block text-[9px] uppercase font-bold">Probability</span><strong className="text-slate-800 text-[11px]">{selectedItem.probability} / 4</strong></div>
                  <div><span className="text-slate-400 block text-[9px] uppercase font-bold">Importance</span><strong className="text-slate-800 text-[11px]">{selectedItem.importance}</strong></div>
                  <div><span className="text-slate-400 block text-[9px] uppercase font-bold">Detectability</span><strong className="text-slate-800 text-[11px]">{selectedItem.detectability || "Medium"}</strong></div>
                  <div><span className="text-slate-400 block text-[9px] uppercase font-bold">ROAM Category</span><strong className="text-slate-800 font-bold text-[11px]">{selectedItem.roamCategory || "New / Unassigned"}</strong></div>
                  <div><span className="text-slate-400 block text-[9px] uppercase font-bold">Status Variant</span><strong className="text-slate-800 text-[11px]">{selectedItem.status}</strong></div>
                </div>

                {/* LINK VERIFICATION MATRIX FOOTER */}
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xs flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <div className="flex gap-6">
                    <p>Origin Group: <strong className="text-slate-700">{selectedItem.sourceType || "Manual"}</strong></p>
                    <p>Lineage Token Ledger ID: <strong className="text-slate-600 font-mono">{selectedItem.id.slice(0,8).toUpperCase()}</strong></p>
                  </div>
                  {selectedItem.sourceReferenceId && (
                    <a href={`/field?id=${selectedItem.sourceReferenceId}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 font-bold hover:underline inline-flex items-center gap-1">
                      Inspect Source Ledger Form <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>

                {/* FOOTER AUDIT COMMENT ARCHIVE ROW */}
                <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-6 pt-2">
                  <form onSubmit={handleCommitComment} className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Comment Box</label>
                    <Textarea 
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      placeholder="Commit alignment tracking evaluations here..."
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
                        <span className="text-slate-400 italic block text-center pt-8 font-mono">No historical evaluation notes logs recorded.</span>
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
                  {clusteredData.length} active logs within active window bounds
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
                    title={`ROAM Category: ${item.roamCategory || 'Unassigned'}`}
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-400">
                  <span>Class: <strong className="text-slate-600 font-bold">{item.classification}</strong></span>
                  <span>Impact: <strong className="text-slate-600 font-bold">{item.importance}</strong></span>
                </div>
              </div>
            ))}
            {clusteredData.length === 0 && (
              <div className="text-center text-slate-400 italic font-mono text-xs pt-16">
                No active records match the designated timeline configuration parameters.
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}