"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RAIDItem } from "@/types/portfolio";

type Severity = "ALL" | "Critical" | "Mandatory" | "High";

interface ActiveThreatRiskRegisterProps {
  risks: RAIDItem[];
  severity: string;
  onSeverityChange: (severity: Severity) => void;
  statusColors: Record<string, string>;
}

export function ActiveThreatRiskRegister({ risks, severity, onSeverityChange, statusColors }: ActiveThreatRiskRegisterProps) {
  const filtered = risks.filter(risk => severity === "ALL" || (risk.impact || risk.importance) === severity);
  return (
    <Card className="border-slate-200 shadow-sm rounded-sm bg-white mt-4">
      <CardHeader className="bg-slate-50 border-b py-2.5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-xs font-bold text-slate-700 uppercase tracking-wider">Active Threat Risk Register</CardTitle>
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-sm border border-slate-200">
          {(["ALL", "Critical", "Mandatory", "High"] as const).map(level => {
            const count = level === "ALL" ? risks.length : risks.filter(risk => (risk.impact || risk.importance) === level).length;
            return <button key={level} type="button" onClick={() => onSeverityChange(level)} className={`px-2 py-0.5 rounded-xs text-[10px] font-mono font-bold border ${severity === level ? "bg-[#142E88] text-white border-[#142E88]" : "bg-white text-slate-600 border-slate-200"}`}>{level.toUpperCase()} ({count})</button>;
          })}
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-3">{filtered.length === 0 ? <div className="text-center text-slate-400 text-xs italic py-10">No matching threats currently registered in PM status updates.</div> : filtered.map(risk => <div key={risk.id} className="border p-2.5 rounded-sm bg-white hover:border-slate-400 transition-all text-xs">
        <div className="flex items-center justify-between mb-1"><span className="font-mono font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">{risk.id}<Badge variant="secondary" className="text-[9px] font-mono rounded-xs px-1.5 py-0 shadow-none border-slate-200">{risk.spec}</Badge><span className="px-1.5 py-0.5 rounded-xs text-[8px] font-bold text-white uppercase" style={{ backgroundColor: statusColors[risk.roamCategory || ""] || statusColors[risk.status || ""] || "#EF4444" }}>{risk.roamCategory || risk.status}</span></span><Badge className={`text-[9px] font-bold rounded-xs shadow-none ${(risk.impact || risk.importance) === "Critical" ? "bg-red-50 text-red-700" : (risk.impact || risk.importance) === "Mandatory" ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-700"}`}>{risk.impact || risk.importance}</Badge></div>
        <h4 className="font-semibold text-slate-700 leading-tight">{risk.threat || risk.description || risk.title}</h4>
      </div>)}</CardContent>
    </Card>
  );
}
