// File: src/app/dashboard/workbench/raid/page.tsx
"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ShieldAlert, RefreshCw, Layers, CheckCircle2 } from "lucide-react";

export default function RaidMatrixDashboard() {
  const [raidItems, setRaidItems] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<string>("ALL");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Stream structural records in real-time from the ledger
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "raid_matrix"), (snap) => {
      setRaidItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // Inside your RaidMatrixDashboard Component:
const executeAiAnalysisPipeline = async () => {
  setIsProcessing(true);
  try {
    const res = await fetch("/api/analyze-raid", { method: "POST" });
    const data = await res.json();
    if (data.success) {
      toast({ title: "Analysis Complete", description: `Successfully generated ${data.processedCount} matrix entries.` });
    } else {
      toast({ variant: "destructive", title: "Pipeline Idle", description: data.message });
    }
  } catch (err) {
    toast({ variant: "destructive", title: "Execution Error", description: "Failed to reach pipeline cluster." });
  } finally {
    setIsProcessing(false);
  }
};

  // Update specific fields immediately upon cell modification
  const handleInlineCellUpdate = async (id: string, field: string, value: string) => {
    try {
      const docRef = doc(db, "raid_matrix", id);
      await updateDoc(docRef, { [field]: value });
    } catch (err) {
      console.error("Meticulous Sync Fault:", err);
    }
  };

  const filteredItems = raidItems.filter(item => 
    activeTab === "ALL" ? true : item.classification?.toUpperCase() === activeTab
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Structural Context Header Panel */}
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-[#142E88]" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">RAID Governance Registry</h1>
            <p className="text-xs text-slate-500">Meticulous alignment and disposition matrix with ORAT and IT Consultants.</p>
          </div>
        </div>
        
        <button 
            onClick={executeAiAnalysisPipeline}
            disabled={isProcessing}
            className="flex items-center gap-1.5 bg-[#142E88] text-white px-4 py-2 text-xs font-bold font-mono hover:bg-[#1f3ab3] transition-colors rounded-sm disabled:opacity-50"
        >
            <RefreshCw className={`h-3.5 w-3.5 ${isProcessing ? 'animate-spin' : ''}`} /> 
            {isProcessing ? "Analyzing Field Logs..." : "Execute AI Log Analysis"}
            </button>
      </div>

      {/* Filter Matrix Controls */}
      <div className="flex gap-2 border-b border-slate-200 pb-px">
        {["ALL", "RISK", "ASSUMPTION", "ISSUE", "DEPENDENCY"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-xs font-bold transition-all border-b-2 tracking-wide -mb-px ${
              activeTab === tab 
                ? "border-[#142E88] text-[#142E88] font-black" 
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab}s
          </button>
        ))}
      </div>

      {/* Ledger Matrix Interface */}
      <Card className="rounded-none border shadow-none bg-white">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-50 border-b text-[10px] font-bold uppercase text-slate-500 font-mono tracking-wider">
                <th className="p-3 w-20">ID</th>
                <th className="p-3 w-28">Type</th>
                <th className="p-3 w-64">Item Context Abstract</th>
                <th className="p-3 w-28">Impact</th>
                <th className="p-3 w-40">Assigned Owner</th>
                <th className="p-3 w-40">Resolution Status</th>
                <th className="p-3">ORAT / Consultant Disposition Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y text-xs">
              {filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="p-3 font-mono font-bold text-slate-400">{item.id.slice(0,6).toUpperCase()}</td>
                  <td className="p-3">
                    <Badge variant="outline" className={`rounded-xs text-[10px] font-bold shadow-none tracking-wide ${
                      item.classification === "Risk" ? "bg-amber-50 text-amber-800 border-amber-200" :
                      item.classification === "Issue" ? "bg-red-50 text-red-700 border-red-200" :
                      "bg-blue-50 text-blue-800 border-blue-200"
                    }`}>
                      {item.classification}
                    </Badge>
                  </td>
                  <td className="p-3 space-y-0.5">
                    <div className="font-bold text-slate-900">{item.title}</div>
                    <div className="text-slate-500 text-[11px] leading-relaxed truncate max-w-xs" title={item.description}>
                      {item.description}
                    </div>
                  </td>
                  <td className="p-3">
                    <span className={`font-mono font-bold ${item.impactLevel === 'High' ? 'text-red-600' : 'text-slate-600'}`}>
                      {item.impactLevel || "Medium"}
                    </span>
                  </td>
                  <td className="p-3">
                    <Select 
                      defaultValue={item.assignedOwner || "Unassigned"} 
                      onValueChange={(val) => handleInlineCellUpdate(item.id, "assignedOwner", val)}
                    >
                      <SelectTrigger className="h-8 text-xs bg-white rounded-none border-slate-200 shadow-none">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-none">
                        <SelectItem value="Unassigned">Unassigned</SelectItem>
                        <SelectItem value="IT Consultant">IT Consultant</SelectItem>
                        <SelectItem value="ORAT Team">ORAT Team</SelectItem>
                        <SelectItem value="CMAR Vendor">CMAR Vendor</SelectItem>
                        <SelectItem value="ITSD Staff">ITSD Staff</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-3">
                    <Select 
                      defaultValue={item.status || "Identified"} 
                      onValueChange={(val) => handleInlineCellUpdate(item.id, "status", val)}
                    >
                      <SelectTrigger className="h-8 text-xs bg-white font-semibold rounded-none border-slate-200 shadow-none">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-none">
                        <SelectItem value="Identified">Identified</SelectItem>
                        <SelectItem value="Under Review">Under Review</SelectItem>
                        <SelectItem value="Dispositioned">Dispositioned</SelectItem>
                        <SelectItem value="Mitigated">Mitigated</SelectItem>
                        <SelectItem value="Closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
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
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                    All clear. No unresolved records matching this classification track.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}