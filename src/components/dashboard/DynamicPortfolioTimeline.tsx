"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Dependency, Milestone, Project } from "@/types/portfolio";

export interface TimelineDateWindow {
  startDateStr: string;
  endDateStr: string;
}

interface DynamicPortfolioTimelineProps {
  projects: Project[];
  milestones: Milestone[];
  dependencies: Dependency[];
  dateWindow?: TimelineDateWindow;
  onDateWindowChange?: (window: TimelineDateWindow) => void;
}

const DEFAULT_WINDOW: TimelineDateWindow = {
  startDateStr: "2026-07-01",
  endDateStr: "2027-03-31",
};

const milestoneDate = (milestone: Milestone) => {
  if (milestone.status === "Complete") {
    return milestone.actualEnd || milestone.actualEndDate || milestone.forecastEnd || milestone.forecastEndDate;
  }
  return milestone.forecastEnd || milestone.forecastEndDate || milestone.baselineEnd || milestone.baselineEndDate;
};

const varianceDays = (baseline?: string, current?: string) => {
  if (!baseline || !current) return 0;
  const baselineTime = new Date(baseline).getTime();
  const currentTime = new Date(current).getTime();
  if (!Number.isFinite(baselineTime) || !Number.isFinite(currentTime)) return 0;
  return Math.round((currentTime - baselineTime) / 86_400_000);
};

export function DynamicPortfolioTimeline({
  projects,
  milestones,
  dependencies,
  dateWindow,
  onDateWindowChange,
}: DynamicPortfolioTimelineProps) {
  const [internalWindow, setInternalWindow] = useState(DEFAULT_WINDOW);
  const [isTdpOpen, setIsTdpOpen] = useState(true);
  const [isCipOpen, setIsCipOpen] = useState(true);
  const [isCrossOpen, setIsCrossOpen] = useState(true);
  const activeWindow = dateWindow || internalWindow;

  const updateWindow = (next: TimelineDateWindow) => {
    if (!dateWindow) setInternalWindow(next);
    onDateWindowChange?.(next);
  };

  const startTime = new Date(activeWindow.startDateStr).getTime();
  const endTime = new Date(activeWindow.endDateStr).getTime();
  const duration = Math.max(1, endTime - startTime);
  const getPosition = (date?: string) => {
    if (!date) return -1;
    const time = new Date(date).getTime();
    if (!Number.isFinite(time)) return -1;
    return ((time - startTime) / duration) * 100;
  };

  const tdpProjects = useMemo(
    () => projects.filter(project => project.program?.toUpperCase().trim() === "TDP"),
    [projects],
  );
  const cipProjects = useMemo(
    () => projects.filter(project => project.program?.toUpperCase().trim() !== "TDP"),
    [projects],
  );
  const projectById = useMemo(() => new Map(projects.map(project => [project.id, project])), [projects]);

  const intervals = useMemo(() => Array.from({ length: 5 }, (_, index) => {
    const factor = index / 4;
    const date = new Date(startTime + duration * factor);
    return {
      position: factor * 100,
      label: date.toLocaleDateString(undefined, { month: "short", year: "numeric" }),
    };
  }), [duration, startTime]);

  const renderMilestones = (items: Milestone[], isTdp: boolean) => items.map((milestone, index) => {
    const currentDate = milestoneDate(milestone);
    const position = getPosition(currentDate);
    if (position < 0 || position > 100) return null;
    const complete = milestone.status === "Complete";
    const baseline = milestone.baselineEnd || milestone.baselineEndDate;
    const variance = varianceDays(baseline, currentDate);
    const project = projectById.get(milestone.projectId);

    return (
      <div
        key={`${milestone.projectId}-${milestone.id || index}`}
        className="group/milestone absolute z-20 hover:z-50 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white shadow-sm cursor-help transition-transform hover:scale-125 isolate"
        style={{ left: `${position}%` }}
      >
        <span className={`block h-full w-full rounded-full ${complete ? "bg-emerald-600" : isTdp ? "bg-[#142E88]" : "bg-purple-600"}`} />
        <div className="invisible absolute top-full left-1/2 z-50 mt-2 w-64 -translate-x-1/2 space-y-1.5 rounded-md border border-slate-700 bg-slate-950 bg-opacity-100 p-3 text-[11px] leading-normal text-white opacity-0 shadow-2xl pointer-events-none transition-all duration-150 group-hover/milestone:visible group-hover/milestone:opacity-100">
          <div className="flex items-center justify-between border-b border-slate-700 pb-1">
            <span className="font-mono text-[10px] font-bold text-sky-400">{milestone.projectId}</span>
            <span className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase ${complete ? "bg-emerald-950 text-emerald-400" : "bg-slate-800 text-slate-300"}`}>
              {complete ? "🟢 Complete" : milestone.status || "Planned"}
            </span>
          </div>
          <div><span className="block text-[9px] font-bold uppercase text-slate-400">Project</span>{project?.name || "Unknown Project"}</div>
          <div><span className="block text-[9px] font-bold uppercase text-slate-400">Milestone</span>{milestone.tradeMilestone || milestone.name || "Unnamed milestone"}</div>
          <div className="grid grid-cols-2 gap-2 border-t border-slate-800 pt-1 font-mono text-[10px]">
            <div><span className="block text-[9px] font-bold uppercase text-slate-400">Baseline End</span>{baseline || "N/A"}</div>
            <div><span className="block text-[9px] font-bold uppercase text-slate-400">{complete ? "Actual End" : "Forecast End"}</span>{currentDate || "N/A"}</div>
          </div>
          <div className="flex justify-between border-t border-slate-800 pt-1 font-mono text-[9px] text-slate-400">
            <span>Variance</span><span className={variance > 0 ? "text-red-400" : "text-emerald-400"}>{variance > 0 ? `+${variance}d` : `${variance}d`}</span>
          </div>
        </div>
      </div>
    );
  });

  const programBounds = (items: Milestone[]) => {
    const times = items.flatMap(item => [
      item.forecastStart || item.forecastStartDate || item.baselineStart || item.baselineStartDate,
      milestoneDate(item),
    ]).filter((date): date is string => Boolean(date)).map(date => new Date(date).getTime()).filter(Number.isFinite);
    if (!times.length) return { left: 0, width: 100 };
    const left = Math.max(0, Math.min(100, ((Math.min(...times) - startTime) / duration) * 100));
    const right = Math.max(0, Math.min(100, ((Math.max(...times) - startTime) / duration) * 100));
    return { left, width: Math.max(2, right - left) };
  };

  const renderProjectRow = (project: Project, isTdp: boolean) => {
    const items = milestones.filter(milestone => milestone.projectId === project.id);
    const bounds = programBounds(items);
    return (
      <div key={project.id} className="relative z-10 hover:z-40 grid grid-cols-[180px_1fr] items-center gap-4 overflow-visible border-b border-slate-100 py-2 last:border-none">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[8px] font-black ${isTdp ? "bg-blue-100 text-[#142E88]" : "bg-purple-100 text-purple-700"}`}>{isTdp ? "TDP" : "CIP"}</span>
          <span className="truncate text-xs font-bold text-slate-700" title={project.name}>{project.name}</span>
        </div>
        <div className="relative flex h-8 w-full items-center overflow-visible">
          <div className={`absolute h-3.5 rounded-full border ${isTdp ? "border-blue-300 bg-blue-100" : "border-purple-300 bg-purple-100"}`} style={{ left: `${bounds.left}%`, width: `${bounds.width}%` }} />
          {renderMilestones(items, isTdp)}
        </div>
      </div>
    );
  };

  const renderProgram = (label: string, programProjects: Project[], isTdp: boolean, open: boolean, toggle: () => void) => {
    const projectIds = new Set(programProjects.map(project => project.id));
    const items = milestones.filter(milestone => projectIds.has(milestone.projectId));
    const bounds = programBounds(items);
    return (
      <div className="relative z-10 hover:z-40 overflow-visible">
        <button type="button" onClick={toggle} className="flex w-full items-center gap-2 rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-left">
          {open ? <ChevronDown className="h-4 w-4 text-[#142E88]" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
          <span className="text-xs font-black text-slate-800">{label}</span>
          <span className="font-mono text-[10px] text-slate-500">({programProjects.length} Projects)</span>
        </button>
        {open ? <div className="pl-2 overflow-visible">{programProjects.map(project => renderProjectRow(project, isTdp))}</div> : (
          <div className="grid grid-cols-[180px_1fr] items-center gap-4 overflow-visible py-2">
            <span className="pl-3 text-[10px] font-bold text-slate-500">Consolidated milestones</span>
            <div className="relative flex h-8 w-full items-center overflow-visible">
              <div className={`absolute h-3 rounded-full border ${isTdp ? "border-blue-300 bg-blue-100" : "border-purple-300 bg-purple-100"}`} style={{ left: `${bounds.left}%`, width: `${bounds.width}%` }} />
              {renderMilestones(items, isTdp)}
            </div>
          </div>
        )}
      </div>
    );
  };

  const mappedDependencies = dependencies.map(dependency => {
    const linked = milestones.find(milestone => milestone.projectId === dependency.projectId && (milestone.name === dependency.linkedMilestone || milestone.tradeMilestone === dependency.linkedMilestone));
    return { ...dependency, date: linked ? milestoneDate(linked) : undefined };
  }).filter(dependency => dependency.date);

  return (
    <Card className="mt-6 overflow-visible border-slate-200 bg-white shadow-sm">
      <CardHeader className="flex flex-col justify-between gap-4 border-b bg-slate-50 py-3 md:flex-row md:items-center">
        <div><CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-800">Dynamic Portfolio Timeline</CardTitle><p className="text-[11px] text-slate-500">Live phase bars, milestone nodes, and cross-track constraints.</p></div>
        <div className="flex flex-wrap items-center gap-3 rounded-sm border bg-white p-2 text-[10px] font-bold">
          <label>Start Window <input type="date" value={activeWindow.startDateStr} onChange={event => updateWindow({ ...activeWindow, startDateStr: event.target.value })} className="ml-1 rounded border px-2 py-1 font-mono" /></label>
          <label>End Horizon <input type="date" value={activeWindow.endDateStr} onChange={event => updateWindow({ ...activeWindow, endDateStr: event.target.value })} className="ml-1 rounded border px-2 py-1 font-mono" /></label>
          <Button type="button" variant="ghost" size="sm" onClick={() => updateWindow(DEFAULT_WINDOW)} className="h-7 text-[10px]"><RotateCcw className="mr-1 h-3 w-3" />Reset Default</Button>
        </div>
      </CardHeader>
      <CardContent className="relative space-y-4 overflow-visible p-6 pb-24 pt-10">
        <div className="pointer-events-none absolute inset-x-6 bottom-10 top-10 z-0 grid grid-cols-[180px_1fr] gap-4">
          <div />
          <div className="relative h-full w-full">{intervals.map((interval, index) => {
            const transform = index === 0 ? "translateX(0%)" : index === intervals.length - 1 ? "translateX(-100%)" : "translateX(-50%)";
            return <div key={interval.label} className="absolute inset-y-0 flex h-full flex-col items-center" style={{ left: `${interval.position}%`, transform }}><div className="h-full w-px border-l border-dashed border-slate-300" /><span className="z-10 mt-2 whitespace-nowrap rounded border border-slate-800 bg-slate-700 px-2 py-1 font-mono text-xs font-black text-white shadow-md">{interval.label}</span></div>;
          })}</div>
        </div>
        {projects.length === 0 ? <div className="py-8 text-center text-sm italic text-slate-400">No active projects found.</div> : <>
          {renderProgram("🏢 TDP TRACK RAIL", tdpProjects, true, isTdpOpen, () => setIsTdpOpen(value => !value))}
          {renderProgram("🏗️ CIP TRACK RAIL", cipProjects, false, isCipOpen, () => setIsCipOpen(value => !value))}
        </>}
        <div className="relative z-10 hover:z-40 overflow-visible border-t border-slate-200 pt-2">
          <button type="button" onClick={() => setIsCrossOpen(value => !value)} className="flex w-full items-center gap-2 rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-left">
            {isCrossOpen ? <ChevronDown className="h-4 w-4 text-emerald-600" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}<span className="text-xs font-black">🔗 CROSS-TRACK DEPENDENCIES</span><span className="font-mono text-[10px] text-slate-500">({mappedDependencies.length})</span>
          </button>
          {isCrossOpen && <div className="grid grid-cols-[180px_1fr] items-center gap-4 py-2"><span className="pl-3 text-xs font-bold text-slate-700">Cross-Project Constraints</span><div className="relative h-8 overflow-visible rounded-sm border border-dashed border-emerald-200">{mappedDependencies.map((dependency, index) => {
            const position = getPosition(dependency.date);
            if (position < 0 || position > 100) return null;
            return <div key={`${dependency.projectId}-${dependency.id || index}`} className={`group/dependency absolute top-2 h-3.5 w-3.5 -translate-x-1/2 rounded-sm border-2 border-white shadow-sm ${dependency.status === "Active Block" ? "bg-red-500" : "bg-emerald-500"}`} style={{ left: `${position}%` }}><div className="invisible absolute top-full left-1/2 z-50 mt-2 w-64 -translate-x-1/2 rounded-md border border-slate-700 bg-slate-950 p-3 text-[11px] text-white opacity-0 shadow-2xl pointer-events-none group-hover/dependency:visible group-hover/dependency:opacity-100"><strong>{dependency.projectId}</strong><p>{dependency.targetEntity || "Unknown target"}</p><p className="text-slate-300">{dependency.activityTask || "Unspecified activity"}</p></div></div>;
          })}</div></div>}
        </div>
      </CardContent>
    </Card>
  );
}
