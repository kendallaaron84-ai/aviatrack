"use client";

import { Activity, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PortfolioDateValue, RollupState } from "@/types/portfolio";

interface LiveProjectTelemetryTableProps {
  projects: RollupState[];
  formatTimestamp: (value: PortfolioDateValue | undefined) => string;
}

export function LiveProjectTelemetryTable({ projects, formatTimestamp }: LiveProjectTelemetryTableProps) {
  return (
    <Card className="border-slate-200 shadow-sm rounded-sm bg-white border-l-4 border-l-[#142E88]">
      <CardHeader className="bg-slate-50 border-b py-3">
        <CardTitle className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2"><Activity className="h-4 w-4 text-[#142E88]" /> Live Project Telemetry (PM Workbench Sync)</CardTitle>
        <CardDescription className="text-[11px]">Real-time ingestion of EVM and schedule data locked by Project Managers.</CardDescription>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        {projects.length === 0 ? <div className="p-10 text-center text-slate-400 text-sm italic bg-white">No active telemetry found for the selected filter combination.</div> : (
          <Table>
            <TableHeader><TableRow className="hover:bg-transparent bg-slate-50/50 border-b-slate-200">
              <TableHead className="text-xs font-bold text-slate-800 py-3 pl-6">Project Context</TableHead><TableHead className="text-xs font-bold text-slate-800">Health Indicator</TableHead><TableHead className="text-xs font-bold text-slate-800">Perf. Ratios (CPI / SPI)</TableHead><TableHead className="text-xs font-bold text-slate-800 text-right">Cost Variance (CV)</TableHead><TableHead className="text-xs font-bold text-slate-800 text-right">Sch. Variance (SV)</TableHead><TableHead className="text-xs font-bold text-slate-800 text-center">Critical Milestone Variance</TableHead><TableHead className="text-xs font-bold text-slate-800 text-center">Blockers</TableHead><TableHead className="text-xs font-bold text-slate-800 text-right pr-6">Last PM Sign-Off</TableHead>
            </TableRow></TableHeader>
            <TableBody>{projects.map(project => {
              const cpi = project.cpi ?? 1;
              const spi = project.spi ?? 1;
              const costVariance = project.costVariance ?? 0;
              const scheduleVariance = project.scheduleVariance ?? 0;
              const slippage = project.criticalMilestoneVarianceDays ?? null;
              const blockers = project.criticalBlockersCount ?? 0;
              return <TableRow key={project.id} className="hover:bg-slate-50/80 transition-colors bg-white">
                <TableCell className="pl-6 py-3"><p className="text-sm font-bold text-[#142E88]">{project.projectName || project.projectId || project.id}</p><p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate w-48">Latest: {project.latestPeriod || "No PM sync"}</p></TableCell>
                <TableCell>{project.statusHealthIndicator === "Critical Risk" ? <Badge className="bg-red-50 text-red-700 border border-red-200 shadow-none font-bold text-[10px] gap-1"><AlertTriangle className="h-3 w-3" /> Critical Risk</Badge> : <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-none font-bold text-[10px] gap-1"><CheckCircle2 className="h-3 w-3" /> On Track</Badge>}</TableCell>
                <TableCell><div className="flex flex-col font-mono text-[11px] font-bold"><span>CPI: <b className={cpi >= 1 ? "text-emerald-600" : "text-red-600"}>{cpi.toFixed(2)}</b></span><span>SPI: <b className={spi >= 1 ? "text-emerald-600" : "text-red-600"}>{spi.toFixed(2)}</b></span></div></TableCell>
                <TableCell className={`text-right font-mono text-sm font-bold ${costVariance >= 0 ? "text-emerald-600" : "text-red-600"}`}>${costVariance.toLocaleString()}</TableCell>
                <TableCell className={`text-right font-mono text-sm font-bold ${scheduleVariance >= 0 ? "text-emerald-600" : "text-red-600"}`}>${scheduleVariance.toLocaleString()}</TableCell>
                <TableCell className="text-center"><span className={`text-xs font-bold px-2 py-1 rounded-sm ${slippage !== null && slippage > 14 ? "bg-red-100 text-red-700" : slippage !== null && slippage > 0 ? "bg-amber-100 text-amber-700" : "text-slate-500"}`}>{slippage === null ? "N/A" : slippage > 0 ? `+${slippage} Days` : `${slippage} Days`}</span></TableCell>
                <TableCell className="text-center"><span className={`text-xs font-bold px-2 py-1 rounded-sm ${blockers > 0 ? "bg-amber-100 text-amber-800 border border-amber-200" : "text-slate-300"}`}>{blockers}</span></TableCell>
                <TableCell className="text-right pr-6"><div className="text-xs font-medium text-slate-700">{project.lastSignOffBy?.split("@")[0] || "N/A"}</div><div className="flex items-center justify-end gap-1 text-[9px] text-slate-400 font-mono"><Clock className="h-2.5 w-2.5" />{formatTimestamp(project.lastSignOffAt)}</div></TableCell>
              </TableRow>;
            })}</TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
