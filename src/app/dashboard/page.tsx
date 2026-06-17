// File: src/app/dashboard/page.tsx
"use client";

import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useState, useEffect } from "react";
import { Search, AlertTriangle, Clock, ShieldAlert, FileSearch } from "lucide-react";

// Centralized Secure Firebase Imports
import { db } from "@/lib/firebase";
import { collection, onSnapshot, getDocs } from "firebase/firestore";

export default function PMDashboardPage() {
  const [observations, setObservations] = useState<any[]>([]);
  const [projectsCount, setProjectsCount] = useState(0);

  // Advanced Dual-Filtering System States
  const [columnFilter, setColumnFilter] = useState("");
  const [commentSearch, setCommentSearch] = useState("");

  useEffect(() => {
    // Live Project Counter
    const unsubProjects = onSnapshot(collection(db, "projects"), (snapshot) => {
      setProjectsCount(snapshot.docs.length);
    });

    // Live Observations Tracker with Deep Comment Hydration
    const unsubObs = onSnapshot(collection(db, "field_observations"), async (snapshot) => {
      const baseObs = snapshot.docs.map(d => {
        const data = d.data();
        const id = d.id;
        
        const submittedDate = data.submittedAt ? new Date(data.submittedAt) : new Date();
        const today = new Date();
        const diffTime = Math.abs(today.getTime() - submittedDate.getTime());
        const ageInDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        let computedPriority = data.priority || "Low";
        let requiresActionAlert = false;
        let requiresFollowUpWarning = false;

        if (data.status !== "Closed") {
          if (ageInDays >= 14) {
            computedPriority = "Critical";
            requiresActionAlert = true;
          } else if (ageInDays >= 7) {
            requiresActionAlert = true;
          } else if (ageInDays >= 3) {
            requiresFollowUpWarning = true;
          }
        }

        return {
          id,
          ...data,
          priority: computedPriority,
          ageInDays,
          requiresActionAlert,
          requiresFollowUpWarning,
          cachedComments: "" 
        };
      });

      // Hydrate sub-collection comments asynchronously for search compatibility
      const fullyHydratedObs = await Promise.all(
        baseObs.map(async (obs) => {
          try {
            const commentsSnap = await getDocs(collection(db, "field_observations", obs.id, "pm_comments"));
            const combinedCommentsText = commentsSnap.docs.map(doc => doc.data().text || "").join(" ");
            return { ...obs, cachedComments: combinedCommentsText.toLowerCase() };
          } catch (e) {
            return obs;
          }
        })
      );

      // Sorting Logic: Action items first, then chronological newest first
      fullyHydratedObs.sort((a, b) => {
        const aIsPending = a.status === "New" || a.status === "Needs Verification";
        const bIsPending = b.status === "New" || b.status === "Needs Verification";
        if (aIsPending && !bIsPending) return -1;
        if (!aIsPending && bIsPending) return 1;
        return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
      });

      setObservations(fullyHydratedObs);
    });

    return () => { unsubProjects(); unsubObs(); };
  }, []);

  // Complex Cross-Filtering Execution Block
  const filteredObs = observations.filter(obs => {
    // 1. Evaluate Multi-Column Comma-Separated Filter
    if (columnFilter.trim() !== "") {
      const tokens = columnFilter.split(",").map(t => t.trim().toLowerCase()).filter(t => t !== "");
      const rowSearchString = `
        for-${obs.id} ${obs.programName || ""} ${obs.projectName || ""} ${obs.stage || ""} 
        ${obs.location || ""} ${obs.resolutionType || ""} ${obs.priority || ""} ${obs.submittedBy || ""} ${obs.status || ""}
      `.toLowerCase();

      const matchesAllTokens = tokens.every(token => rowSearchString.includes(token));
      if (!matchesAllTokens) return false;
    }

    // 2. Evaluate Historical Review Comment Keyword Filter
    if (commentSearch.trim() !== "") {
      const targetKeyword = commentSearch.trim().toLowerCase();
      if (!obs.cachedComments.includes(targetKeyword)) return false;
    }

    return true;
  });

  const pendingReviewCount = observations.filter(obs => obs.status === "New" || obs.status === "In Progress" || obs.status === "Needs Verification").length;
  const criticalAlertsCount = observations.filter(obs => obs.priority === "Critical" && obs.status !== "Closed").length;

  const getStatusBadge = (status: string) => {
    switch(status) {
      case "New": 
      case "Needs Verification":
        return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 shadow-none border-amber-200 rounded-sm font-semibold text-[11px] gap-1"><AlertTriangle className="h-3 w-3 text-amber-600" /> Pending Action</Badge>;
      case "Accepted": 
        return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 shadow-none rounded-sm font-medium">Accepted</Badge>;
      case "In Progress": 
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 shadow-none rounded-sm font-medium">In Progress</Badge>;
      case "Closed": 
        return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100 shadow-none border rounded-sm font-medium">Closed</Badge>;
      case "Rejected":
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 shadow-none border rounded-sm font-medium">Rejected</Badge>;
      default: 
        return <Badge variant="outline" className="rounded-sm font-medium">{status || "New"}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Project Manager Dashboard</h1>
        <p className="text-sm text-slate-500">Review pending field observations, track portfolio health, and manage WBS resolutions.</p>
      </div>

      {/* KPI Header Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-l-4 border-l-[#1EA7F4] rounded-sm shadow-sm bg-white">
          <CardContent className="p-6">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Active Projects</p>
            <p className="text-4xl font-bold text-[#142E88] mt-1">{projectsCount}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-[#885BCE] rounded-sm shadow-sm bg-white">
          <CardContent className="p-6">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Action Required</p>
            <p className="text-4xl font-bold text-amber-600 mt-1">{pendingReviewCount}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-600 rounded-sm shadow-sm bg-white">
          <CardContent className="p-6">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Critical Alerts</p>
            <p className="text-4xl font-bold text-[#142E88] mt-1">{criticalAlertsCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* SEARCH AND ADVANCED CROSS-FILTERING UTILITY HEADER */}
      <Card className="border border-slate-200 shadow-none rounded-none bg-white">
        <CardContent className="p-0">
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x border-b bg-slate-50/50">
            {/* Multi-Column Comma Selector */}
            <div className="p-4 flex items-center gap-3 bg-white">
              <Search className="h-4 w-4 text-slate-400 shrink-0" />
              <div className="w-full">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Multi-Column Column Filter (Comma Separated)</span>
                <Input 
                  placeholder="e.g. CIP, Construction, High" 
                  value={columnFilter}
                  onChange={e => setColumnFilter(e.target.value)}
                  className="border-none shadow-none focus-visible:ring-0 p-0 h-6 text-sm placeholder:text-slate-300 w-full"
                />
              </div>
            </div>
            
            {/* Historical Review Comment Search Box */}
            <div className="p-4 flex items-center gap-3 bg-white">
              <FileSearch className="h-4 w-4 text-[#3c38d4] shrink-0" />
              <div className="w-full">
                <span className="block text-[10px] font-bold text-[#3c38d4] uppercase tracking-wider mb-0.5">Deep Comment Search (Review Notes)</span>
                <Input 
                  placeholder="Search historical keywords inside PM logs..." 
                  value={commentSearch}
                  onChange={e => setCommentSearch(e.target.value)}
                  className="border-none shadow-none focus-visible:ring-0 p-0 h-6 text-sm placeholder:text-slate-300 w-full"
                />
              </div>
            </div>
          </div>

          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow className="hover:bg-slate-50">
                <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider">ID</TableHead>
                <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider">Date</TableHead>
                <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider">Program</TableHead>
                <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider">Project</TableHead>
                <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider">Stage</TableHead>
                <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider">Location</TableHead>
                <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider">Type</TableHead>
                <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider">Priority</TableHead>
                <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider">Submitted By</TableHead>
                <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider">Status</TableHead>
                <TableHead className="font-bold text-slate-800 text-xs uppercase tracking-wider">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredObs.map((obs) => {
                const isActionRequiredRow = obs.status === "New" || obs.status === "Needs Verification";
                
                return (
                  <TableRow 
                    key={obs.id} 
                    className={`hover:bg-slate-50/80 transition-colors ${
                      isActionRequiredRow 
                        ? 'bg-amber-50/40 border-l-4 border-l-amber-500' 
                        : (obs.requiresActionAlert ? 'bg-red-50/30' : 'bg-white')
                    }`}
                  >
                    <TableCell className="font-semibold text-slate-900 text-xs">FOR-{obs.id.slice(0, 6).toUpperCase()}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{obs.submittedAt ? obs.submittedAt.split('T')[0] : 'N/A'}</TableCell>
                    <TableCell className="text-xs font-medium">{obs.programName}</TableCell>
                    <TableCell className="max-w-[180px] truncate text-xs" title={obs.projectName}>{obs.projectName}</TableCell>
                    <TableCell className="text-xs text-slate-600">{obs.stage}</TableCell>
                    <TableCell className="text-xs text-slate-600">{obs.location}</TableCell>
                    <TableCell className="text-xs text-slate-600">{obs.resolutionType || "General"}</TableCell>
                    
                    <TableCell className="text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className={obs.priority === 'Critical' ? 'text-red-600 font-bold' : 'text-slate-700'}>
                          {obs.priority}
                        </span>
                        {obs.requiresActionAlert && <ShieldAlert className="h-3.5 w-3.5 text-red-500 animate-pulse shrink-0" title={`Overdue verification: ${obs.ageInDays} days unreviewed.`} />}
                        {!obs.requiresActionAlert && obs.requiresFollowUpWarning && <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" title={`Awaiting PM check: ${obs.ageInDays} days unreviewed.`} />}
                      </div>
                    </TableCell>
                    
                    <TableCell className="text-xs text-slate-600 truncate max-w-[100px]">{obs.submittedBy || "Field Engineer"}</TableCell>
                    <TableCell>{getStatusBadge(obs.status)}</TableCell>
                    <TableCell>
                      <Link href={`/dashboard/review/${obs.id}`} className="text-[#3c38d4] font-bold hover:underline text-xs">
                        Review
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredObs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-12 text-sm text-muted-foreground">
                    No active observations detected matching criteria parameters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}