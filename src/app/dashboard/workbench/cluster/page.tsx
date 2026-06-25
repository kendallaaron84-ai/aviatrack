// File sample configuration structure: src/app/dashboard/workbench/cluster/page.tsx
"use client";

import React, { useState, useMemo } from "react";
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import { kmeans } from "ml-kmeans"; // Fast, client-side cluster execution array

// 1. Setup categorical numerical maps to feed the clustering calculation engine safely
const IMPORTANCE_WEIGHTS: Record<string, number> = { Critical: 1.0, Mandatory: 0.8, High: 0.6, Medium: 0.4, Low: 0.2 };

export default function RiskClusterDashboard({ rawRaidqItems }: { rawRaidqItems: any[] }) {
  const [selectedItem, setSelectedItem] = useState<any>(null);

  // Compute K-Means grouping live as data filters mutate
  const clusteredData = useMemo(() => {
    if (rawRaidqItems.length === 0) return [];

    // Convert raw string parameters into numerical vectors: [X, Y]
    const vectors = rawRaidqItems.map(item => [
      IMPORTANCE_WEIGHTS[item.importance] || 0.4, // X-Axis calculation coordinate
      (item.probability || 0) / 4                 // Y-Axis calculation coordinate
    ]);

    // Execute clustering grouping your risks into 4 distinct groups (K=4)
    const numberOfClusters = 4;
    const ans = kmeans(vectors, numberOfClusters, {});

    // Map cluster identities directly back onto your original data arrays
    return rawRaidqItems.map((item, idx) => ({
      ...item,
      x: vectors[idx][0],
      y: vectors[idx][1],
      clusterId: ans.clusters[idx] // Group assignment integer (0, 1, 2, 3)
    }));
  }, [rawRaidqItems]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_350px] gap-6 p-6 min-h-screen bg-slate-900 text-white">
      
      {/* LEFT BLOCK: THE VIEW GRID PLOT CONTROLLER */}
      <div className="space-y-4">
        <div className="relative border border-slate-700 bg-slate-800 p-4 rounded-sm h-[500px]">
          
          {/* BACKGROUND ROAM LABELS MATCHING YOUR DRAFT */}
          <div className="absolute inset-0 p-6 flex flex-col justify-between pointer-events-none text-xs font-mono font-bold text-amber-500/40">
            <div className="flex justify-between"><span>Resolved</span><span>Accepted</span></div>
            <div className="flex justify-between"><span>Owned</span><span>Mitigated</span></div>
          </div>

          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <XAxis type="number" dataKey="x" name="Importance" domain={[0, 1]} hide />
              <YAxis type="number" dataKey="y" name="Probability" domain={[0, 1]} hide />
              <ZAxis type="number" range={[100, 120]} />
              
              {/* CROSS AXIS GRID DIVIDERS */}
              <ReferenceLine x={0.5} stroke="#ef4444" strokeWidth={2} />
              <ReferenceLine y={0.5} stroke="#ef4444" strokeWidth={2} />

              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              
              {/* DRAW SCATTER MARKERS WITH CLUSTER-BASED DYNAMIC COLORS */}
              <Scatter 
                data={clusteredData} 
                onClick={(node) => setSelectedItem(node.payload)}
                className="cursor-pointer"
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* BOTTOM PANEL: AUDIT CONFIGURATION LAYER & DETAIL SUB-SECTION */}
        {selectedItem && (
          <div className="border border-slate-700 bg-slate-800 p-4 space-y-4 rounded-sm text-xs">
            <h3 className="text-sm font-bold text-amber-500">Risk Details Section: {selectedItem.title}</h3>
            <div className="grid grid-cols-4 gap-4 font-mono">
              <div><strong>RAIDQ Type:</strong> {selectedItem.classification}</div>
              <div><strong>Probability:</strong> {selectedItem.probability} / 4</div>
              <div><strong>Importance:</strong> {selectedItem.importance}</div>
              <div><strong>Status:</strong> {selectedItem.status}</div>
            </div>
            {/* Context comments input box layout matches wireframe footer specs */}
            <textarea className="w-full bg-slate-950 border border-slate-700 p-2 h-16 rounded-xs" placeholder="Comment Box..." />
          </div>
        )}
      </div>

      {/* RIGHT BLOCK: THE LIVE INDEX SIDEBAR */}
      <div className="border border-slate-700 bg-slate-800 p-4 rounded-sm overflow-y-auto max-h-[700px]">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 border-b border-slate-700 pb-2">Active Risk Registry Index</h2>
        <div className="space-y-2">
          {clusteredData.map((item) => (
            <div 
              key={item.id} 
              onClick={() => setSelectedItem(item)}
              className={`p-2 border font-mono text-[11px] cursor-pointer transition-colors flex justify-between ${
                selectedItem?.id === item.id ? 'border-amber-500 bg-amber-500/10' : 'border-slate-700 bg-slate-900/50 hover:border-slate-500'
              }`}
            >
              <span>{item.title || "Risk Assignment Item"}</span>
              <span className="text-amber-500">[{item.status}]</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}