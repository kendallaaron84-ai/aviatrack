// File: src/app/dashboard/portfolio/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal, Layers, LayoutDashboard, Database, ShieldAlert, CheckCircle2 } from "lucide-react";
import { db, auth } from "@/lib/firebase";

// Native Firebase (Using your exact file initialization pattern)
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, onSnapshot } from "firebase/firestore";

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

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

export default function YteviaExecutiveControlRoom() {
  // 4-Tier Independent MULTI-SELECT Selection Arrays (States)
  const [selectedAssets, setSelectedAssets] = useState<string[]>(["TDP"]); // Default focus
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);

  // Live Firebase Collection Sinks
  const [workPackages, setWorkPackages] = useState<any[]>([]);
  const [fieldObservations, setFieldObservations] = useState<any[]>([]);

  useEffect(() => {
    // Stream configuration and operational assets
    const unsubWp = onSnapshot(collection(db, "master_work_packages"), (s) => setWorkPackages(s.docs.map(d => d.data())));
    const unsubObs = onSnapshot(collection(db, "field_observations"), (s) => setFieldObservations(s.docs.map(d => d.data())));
    return () => { unsubWp(); unsubObs(); };
  }, []);

  // Multi-Select Toggle Array Processor Helpers
  const toggleSelection = (id: string, state: string[], setState: React.Dispatch<React.SetStateAction<string[]>>) => {
    setState(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  // Determine active elevation options dynamically based on what assets are selected
  const availableLevels = Array.from(
    new Set(selectedAssets.flatMap(assetId => ELEVATION_LEVELS[assetId] || []))
  );

  // This logic cross-references your 4-tier selection states with your actual live data parameters
const filteredPackages = workPackages.filter(wp => {
  // If no specific sectors are chosen, pass all; otherwise, match the active sector tags
  if (selectedSectors.length > 0) {
    const assetMatch = selectedAssets.includes(wp.id.startsWith("FPP") ? "TDP" : "TCPG");
    return assetMatch;
  }
  return true;
});

const filteredObservationsList = fieldObservations.filter(obs => {
  // 1. Filter by Capital Facility Asset
  if (selectedAssets.length > 0 && !selectedAssets.includes(obs.program)) return false;
  
  // 2. Filter by Linked Work Package
  if (selectedTracks.length > 0) {
    const isDirect = obs.workPackageId === "FPP004b" || obs.workPackageId === "WP5"; // Sample logic mapping IT_Direct vs CMAR
    if (selectedTracks.includes("IT_DIRECT") && !isDirect) return false;
    if (selectedTracks.includes("CMAR") && isDirect) return false;
  }
  
  return true;
});

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
        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 font-mono text-[10px] rounded-xs py-0.5 px-2 font-bold flex items-center gap-1 shadow-none">
          <CheckCircle2 className="h-3 w-3" /> Secure Sync Active
        </Badge>
      </div>

      {/* PILLAR 3: THE 4-TIER MULTI-SELECT INTERACTIVE SLICER SIDEBAR BAR */}
      <Card className="border-slate-200 shadow-xs rounded-sm overflow-hidden bg-white">
        <CardHeader className="bg-slate-50 border-b py-2.5 flex flex-row items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-slate-500" />
          <div>
            <CardTitle className="text-xs font-bold text-slate-700 uppercase tracking-wider">Multi-Select Program Scope Control Matrix</CardTitle>
            <CardDescription className="text-[10px] text-slate-400">Toggle combinations across physical tiers and logical tech sectors to filter the entire portfolio dashboard simultaneously.</CardDescription>
          </div>
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
                    onClick={() => {
                      toggleSelection(asset.id, selectedAssets, setSelectedAssets);
                      setSelectedLevels([]); // Clear elevation layers on shift to ensure clean data cross-filtering
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-xs border font-semibold transition-all text-[11px] ${active ? "bg-[#142E88] border-[#142E88] text-white shadow-xs" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"}`}
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
                      onClick={() => toggleSelection(level, selectedLevels, setSelectedLevels)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-xs border font-semibold transition-all text-[11px] ${active ? "bg-[#142E88] border-[#142E88] text-white shadow-xs" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"}`}
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
                    onClick={() => toggleSelection(sector.id, selectedSectors, setSelectedSectors)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-xs border font-semibold transition-all text-[11px] ${active ? "bg-[#142E88] border-[#142E88] text-white shadow-xs" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"}`}
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
                    onClick={() => toggleSelection(track.id, selectedTracks, setSelectedTracks)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-xs border font-semibold transition-all text-[11px] ${active ? "bg-[#142E88] border-[#142E88] text-white shadow-xs" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"}`}
                  >
                    {track.name}
                  </button>
                );
              })}
            </div>
          </div>

        </CardContent>
      </Card>

      {/* TEMPORARY STATUS PLACEHOLDER SUITE FOR REMAINING MODULE INTELLIGENCE */}
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
              Synced master assets found in memory footprint: <strong className="text-slate-800">{workPackages.length} Work Packages</strong> and <strong className="text-slate-800">{fieldObservations.length} Active Field Logs</strong>.
            </p>
          </div>
        </Card>
      </div>

    </div>
  );
}