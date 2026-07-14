// File: src/app/dashboard/workbench/raid/page.tsx
"use client\";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ShieldAlert, RefreshCw, Layers, Filter } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function RaidMatrixDashboard() {
  const [raidItems, setRaidItems] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<string>("ALL");
  const [selectedProject, setSelectedProject] = useState<string>("ALL"); // 🆕 Project filter state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Stream structural records in real-time from the ledger
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "raid_matrix"), (snap) => {
      setRaidItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // 🆕 Dynamically aggregate unique projects for the filter dropdown
  const uniqueProjects = Array.from(
    new Set(raidItems.map((item) => item.projectName || item.projectId).filter(Boolean))
  );

  // Filter items based on BOTH classification tab and project selection
  const filteredItems = raidItems.filter((item) => {
    const matchesTab = activeTab === "ALL" || item.classification === activeTab;
    const matchesProject = selectedProject === "ALL" || (item.projectName || item.projectId) === selectedProject;
    return matchesTab && matchesProject;
  });

  const handleInlineCellUpdate = async (id: string, field: string, value: string) => {
    // ... your existing cell update logic remains perfectly intact
  };

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen text-slate-900">
      {/* Upper Control Bar Layout */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2 text-slate-900">
            <ShieldAlert className="h-6 w-6 text-[#142E88]" />
            ITSD PMO RAID Ledger Matrix
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Risk, Assumptions, Issues, and Dependencies cross-examination pipeline.
          </p>
        </div>

        {/* 🆕 PROJECT FILTER DROPDOWN */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="h-4 w-4 text-slate-400 shrink-0" />
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="w-full md:w-[220px] bg-white border-slate-200 text-xs">
              <SelectValue placeholder="Filter by Project Scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Portfolio Projects</SelectItem>
              {uniqueProjects.map((projName: any) => (
                <SelectItem key={projName} value={projName}>
                  {projName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Primary Workspace Grid Ledger */}
      <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
          <div className="flex flex-wrap justify-between items-center gap-4">
            {/* Classification Nav Tabs */}
            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              {["ALL", "RISK", "ASSUMPTION", "ISSUE", "DEPENDENCY"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 text-[10px] font-black tracking-wider rounded-md transition-all ${
                    activeTab === tab
                      ? "bg-white text-[#142E88] shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                <th className="p-3 pl-6 w-[240px]">Target Asset / Context Track</th>
                <th className="p-3 w-[140px]">System Context</th>
                <th className="p-3 w-[90px]">Probability</th>
                <th className="p-3 w-[90px]">Impact</th>
                <th className="p-3 w-[100px]">Status</th>
                <th className="p-3">PMO Audit Alignment Conclusions & Disposition Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-3 pl-6 font-medium">
                    <div className="flex flex-col gap-1">
                      {/* Item Core Title */}
                      <span className="font-bold text-slate-900 line-clamp-1">{item.title}</span>
                      
                      {/* 🆕 INJECTED PROJECT DISPLAY NAME BADGE */}
                      <div className="flex items-center gap-1.5">
                        <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100 border border-slate-200 text-[9px] px-1.5 py-0 font-mono tracking-tight shrink-0 rounded-xs">
                          📁 {item.projectName || item.projectId || "Unassigned Project"}
                        </Badge>
                        <span className="text-[10px] text-slate-400 font-mono">#{item.id.slice(0,5)}</span>
                      </div>
                    </div>
                  </td>
                  
                  <td className="p-3">
                    <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-wider">
                      {item.classification}
                    </Badge>
                  </td>

                  {/* Rest of your existing table cells continue completely unmodified... */}
                  <td className="p-3 font-mono">{item.probability}</td>
                  <td className="p-3 font-mono">{item.impact}</td>
                  <td className="p-3">{item.status}</td>
                  <td className="p-3">
                    <Input 
                      defaultValue={item.dispositionNotes || ""}
                      placeholder="Commit audit alignment conclusions here..."
                      onBlur={(e) => handleInlineCellUpdate(item.id, "dispositionNotes", e.target.value)}
                      className="h-8 text-xs bg-transparent border-0 border-b border-transparent hover:border-slate-200 focus:border-slate-400 focus:bg-white rounded-none shadow-none transition-all"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}