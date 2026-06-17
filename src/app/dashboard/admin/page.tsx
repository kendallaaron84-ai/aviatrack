// File: src/app/dashboard/admin/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

// Consolidated Icons
import { 
  ShieldCheck, Plus, Trash2, Save, UserPlus, 
  FolderKanban, Terminal, MapPin, Layers, HelpCircle, KeyRound,
  Archive, CheckCircle, FileText
} from "lucide-react";

// Centralized Firebase Imports
import { db, auth } from "@/lib/firebase";
import { collection, addDoc, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";

export default function AdminPortalPage() {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  // 🟢 NEW: PM Workspace Scoped States
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [projectLocations, setProjectLocations] = useState<any[]>([]);
  const [weeklySummary, setWeeklySummary] = useState("");
  const [newLocation, setNewLocation] = useState("");

  // Core Directory Lists
  const [projects, setProjects] = useState<any[]>([]);
  const [personnel, setPersonnel] = useState<any[]>([]);
  const [sectors, setSectors] = useState<any[]>([]);
  const [riskPrompt, setRiskPrompt] = useState("Analyze the following construction observation for technical dependencies, safety deviations from Airport Security Annex 04, and resource blockers. Categorize the target trade.");

  const [keywords, setKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState("");

  // Geospatial Editing States
  const [isGeoModalOpen, setIsGeoModalOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editLat, setEditLat] = useState("");
  const [editLong, setEditLong] = useState("");

  // Forms State
  const [newProject, setNewProject] = useState({ id: "", name: "", program: "TDP", budget: "", wbs: "", lat: "", lng: "", isUnplannedInjection: false });
  const [newPerson, setNewPerson] = useState({ name: "", company: "" });
  const [newSector, setNewSector] = useState({ code: "", projectId: "" });

  // 🟢 UPGRADED: Stream Master Admin Project Directory & Global Settings
  useEffect(() => {
    const unsubProj = onSnapshot(collection(db, "admin_projects"), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setProjects(data);
      if (data.length > 0 && !selectedProjectId) {
        setSelectedProjectId(data[0].id); // Auto-select first project
      }
    });
    const unsubKeywords = onSnapshot(collection(db, "config_keywords"), (snap) => {
      setKeywords(snap.docs.map(d => d.id));
    });
    const unsubPrompt = onSnapshot(doc(db, "admin_settings", "risk_matrix_config"), (snap) => {
      if (snap.exists()) setRiskPrompt(snap.data().promptText || "");
    });
    return () => { unsubProj(); unsubKeywords(); unsubPrompt(); };
  }, [selectedProjectId]);

  // 🟢 NEW: Stream Scoped Context (Locations, Personnel, Summaries) for Active PM
  useEffect(() => {
    if (!selectedProjectId) return;

    const unsubPers = onSnapshot(collection(db, "admin_projects", selectedProjectId, "personnel"), (snap) => {
      setPersonnel(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubLocs = onSnapshot(collection(db, "admin_projects", selectedProjectId, "locations"), (snap) => {
      setProjectLocations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const activeProj = projects.find(p => p.id === selectedProjectId);
    setWeeklySummary(activeProj?.weeklySummaryText || "");

    const unsubSec = onSnapshot(collection(db, "admin_sectors"), (snap) => {
      setSectors(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubPers(); unsubLocs(); unsubSec(); };
  }, [selectedProjectId, projects]);

  const handleAddKeyword = async (e: React.FormEvent) => {
    e.preventDefault();
    const sanitized = newKeyword.trim().toLowerCase();
    if (!sanitized || keywords.includes(sanitized)) return;
    await setDoc(doc(db, "config_keywords", sanitized), { addedAt: new Date().toISOString(), active: true });
    setNewKeyword("");
  };

  const handleRemoveKeyword = async (word: string) => {
    await deleteDoc(doc(db, "config_keywords", word));
  };

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProject.id || !newProject.name) return;
    try {
      await setDoc(doc(db, "admin_projects", newProject.id), {
        name: newProject.name,
        program: newProject.program,
        budget: parseFloat(newProject.budget || "0"),
        wbs: newProject.wbs || "33-00000-00-00",
        latitude: parseFloat(newProject.lat || "29.53000"), 
        longitude: parseFloat(newProject.lng || "-98.46000"), 
        isUnplannedInjection: newProject.isUnplannedInjection,
        weeklySummaryText: ""
      });
      toast({ title: "Project Injected", description: "Work package added across portfolio forms." });
      setNewProject({ id: "", name: "", program: "TDP", budget: "", wbs: "", lat: "", lng: "", isUnplannedInjection: false });
    } catch (e) { toast({ variant: "destructive", title: "Write Failed" }); }
  };

  // 🟢 UPGRADED: Writes to the specific PM Project Scope
  const handleAddPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPerson.name || !selectedProjectId) return;
    try {
      await addDoc(collection(db, "admin_projects", selectedProjectId, "personnel"), {
        ...newPerson,
        active: true // Active by default
      });
      toast({ title: "Personnel Added", description: `${newPerson.name} tied directly to ${selectedProjectId}.` });
      setNewPerson({ name: "", company: "" });
    } catch (e) { }
  };

  // 🟢 NEW: PM Action Handlers
  const togglePersonArchive = async (personId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, "admin_projects", selectedProjectId, "personnel", personId), { active: !currentStatus });
      toast({ title: currentStatus ? "Person Archived" : "Person Re-Activated" });
    } catch (e) { }
  };

  const handleSaveWeeklySummary = async () => {
    if (!selectedProjectId) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, "admin_projects", selectedProjectId), {
        weeklySummaryText: weeklySummary,
        summaryTimestamp: new Date().toISOString()
      });
      toast({ title: "Weekly Executive Summary Saved" });
    } catch (e) { } finally { setIsSaving(false); }
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanLoc = newLocation.trim();
    if (!cleanLoc || !selectedProjectId) return;
    try {
      await addDoc(collection(db, "admin_projects", selectedProjectId, "locations"), { name: cleanLoc, addedAt: new Date().toISOString() });
      setNewLocation("");
      toast({ title: "Location Bound to Project" });
    } catch (e) { }
  };

  const handleDeleteLocation = async (locId: string) => {
    try {
      await deleteDoc(doc(db, "admin_projects", selectedProjectId, "locations", locId));
      toast({ title: "Location Purged" });
    } catch (e) { }
  };

  const handleAddSector = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSector.code) return;
    try {
      await addDoc(collection(db, "admin_sectors"), newSector);
      toast({ title: "Sector Bound", description: `Sector ${newSector.code} mapped successfully.` });
      setNewSector({ code: "", projectId: newSector.projectId });
    } catch (e) { }
  };

  const handleSavePromptConfig = async () => {
    setIsSaving(true);
    try {
      await setDoc(doc(db, "admin_settings", "risk_matrix_config"), { promptText: riskPrompt }, { merge: true });
      toast({ title: "Prompt Context Saved", description: "Risk core baseline instructions updated." });
    } catch (e) { } finally { setIsSaving(false); }
  };

  const handleUpdateGeospatialData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProjectId) return;
    try {
      const projectDocRef = doc(db, "admin_projects", editingProjectId);
      await updateDoc(projectDocRef, {
        coordinates: { lat: parseFloat(editLat) || 29.53000, lng: parseFloat(editLong) || -98.46000 },
        latitude: parseFloat(editLat) || 29.53000,
        longitude: parseFloat(editLong) || -98.46000
      });
      setIsGeoModalOpen(false);
      setEditingProjectId(null);
      toast({ title: "Geospatial Coordinates Synchronized", description: `Updated project ${editingProjectId} with live tracking marks.` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Update Failed", description: err.message });
    }
  };

  const handleDeleteRecord = async (col: string, id: string) => {
    try {
      await deleteDoc(doc(db, col, id));
      toast({ title: "Entry Removed", description: "Item purged from drop selections." });
    } catch (e) { }
  };

  return (
    <div className="max-w-[1500px] mx-auto space-y-6 pb-12 font-sans">
      <div className="flex items-center gap-2 border-b pb-4">
        <ShieldCheck className="h-6 w-6 text-emerald-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">PM Control Workspace</h1>
          <p className="text-sm text-slate-500">Inject master project modules, update active site rosters, locations, and commit weekly summaries.</p>
        </div>
      </div>

      {/* 🟢 NEW: ACTIVE MANAGEMENT FOCUS CONTROLLER */}
      <div className="bg-slate-50 border p-3 rounded-sm flex items-center gap-4 mb-2">
        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">PM Workspace Target:</label>
        <select 
          value={selectedProjectId} 
          onChange={e => setSelectedProjectId(e.target.value)}
          className="w-80 border p-1.5 text-sm font-bold rounded-sm bg-white border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#142E88]"
        >
          {projects.map(p => <option key={p.id} value={p.id}>{p.id} — {p.name}</option>)}
        </select>
      </div>

      {/* GLOBAL RISK PROMPT INSTRUCTION OVERRIDE BOX */}
      <Card className="border-emerald-500/30 shadow-none rounded-sm bg-emerald-50/10">
        <CardHeader className="py-3 border-b border-emerald-500/10 bg-emerald-50/30">
          <CardTitle className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-2">
            <Terminal className="h-4 w-4 text-emerald-600" /> Global Risk Matrix Instruction Prompt Text
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1">
            <Textarea value={riskPrompt} onChange={e => setRiskPrompt(e.target.value)} className="bg-white text-xs font-mono border-slate-200 shadow-none rounded-sm leading-relaxed" rows={2} />
          </div>
          <Button onClick={handleSavePromptConfig} disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-sm text-xs font-bold px-6 h-9 shrink-0">
            <Save className="h-3.5 w-3.5 mr-1" /> Commit Blueprint Instruction
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        <div className="xl:col-span-2 space-y-6">
          
          {/* 🟢 NEW: WEEKLY EXECUTIVE STATUS REPORT BLOCK */}
          <Card className="border-blue-500/30 shadow-sm rounded-sm bg-blue-50/5">
            <CardHeader className="py-3 border-b border-blue-500/10 bg-blue-50/20">
              <CardTitle className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-blue-700" /> PM Weekly Status Summary (Due Mondays)</span>
                <Badge variant="outline" className="border-blue-300 text-blue-700 font-mono text-[9px] bg-white">Target: {selectedProjectId}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <Textarea 
                value={weeklySummary} 
                onChange={e => setWeeklySummary(e.target.value)} 
                placeholder="Enter current milestones, civil execution delays, fiber path blow-ins, or equipment testing matrices for this week..."
                className="bg-white text-xs font-sans border-slate-200 shadow-none rounded-sm leading-relaxed" 
                rows={3} 
              />
              <div className="flex justify-end">
                <Button onClick={handleSaveWeeklySummary} disabled={isSaving} className="bg-[#142E88] hover:bg-blue-800 text-white rounded-sm text-xs font-bold px-6 h-8">
                  Commit Status Matrix
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* MASTER PROJECT WORK PACKAGES */}
          <Card className="border-slate-200 shadow-sm rounded-sm">
            <CardHeader className="bg-slate-50 border-b py-3">
              <CardTitle className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <FolderKanban className="h-4 w-4 text-[#142E88]" /> Master Project Work Packages
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-6">
              <form onSubmit={handleAddProject} className="grid grid-cols-1 md:grid-cols-4 gap-3 border-b pb-5 items-end">
                <div><label className="block text-[10px] font-bold text-slate-600 mb-0.5">Project ID</label><Input value={newProject.id} onChange={e => setNewProject({...newProject, id: e.target.value.toUpperCase()})} placeholder="e.g. TDP-15" className="h-8 text-xs font-bold rounded-sm" required /></div>
                <div className="md:col-span-2"><label className="block text-[10px] font-bold text-slate-600 mb-0.5">Project Display Name</label><Input value={newProject.name} onChange={e => setNewProject({...newProject, name: e.target.value})} placeholder="e.g. New Terminal Work Package" className="h-8 text-xs rounded-sm" required /></div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Program Track</label>
                  <select value={newProject.program} onChange={e => setNewProject({...newProject, program: e.target.value})} className="w-full border p-1 text-xs rounded-sm bg-white h-8">
                    <option value="TDP">TDP Track</option><option value="CIP">CIP Track</option>
                  </select>
                </div>
                <div><label className="block text-[10px] font-bold text-slate-600 mb-0.5">Approved Budget ($)</label><Input type="number" value={newProject.budget} onChange={e => setNewProject({...newProject, budget: e.target.value})} placeholder="12500000" className="h-8 text-xs rounded-sm" /></div>
                <div><label className="block text-[10px] font-bold text-slate-600 mb-0.5">SAP WBS Code</label><Input value={newProject.wbs} onChange={e => setNewProject({...newProject, wbs: e.target.value})} placeholder="33-03322-05-02" className="h-8 text-xs font-mono rounded-sm" /></div>
                <div className="grid grid-cols-2 gap-1">
                  <div><label className="block text-[9px] font-bold text-slate-500 mb-0.5">Latitude</label><Input type="number" step="any" value={newProject.lat} onChange={e => setNewProject({...newProject, lat: e.target.value})} placeholder="29.53" className="h-8 text-xs px-1" /></div>
                  <div><label className="block text-[9px] font-bold text-slate-500 mb-0.5">Longitude</label><Input type="number" step="any" value={newProject.lng} onChange={e => setNewProject({...newProject, lng: e.target.value})} placeholder="-98.46" className="h-8 text-xs px-1" /></div>
                </div>
                
                <div className="flex items-center h-8 gap-2 border px-3 rounded-sm bg-slate-50/50">
                  <input 
                    type="checkbox" 
                    id="co-toggle"
                    checked={newProject.isUnplannedInjection} 
                    onChange={e => setNewProject({...newProject, isUnplannedInjection: e.target.checked})} 
                    className="h-3.5 w-3.5 rounded-xs border-slate-300 text-[#142E88] focus:ring-[#142E88] cursor-pointer"
                  />
                  <label htmlFor="co-toggle" className="text-[10px] font-bold text-slate-700 select-none cursor-pointer">
                    Is this a Change Order?
                  </label>
                </div>

                <Button type="submit" className="bg-[#142E88] hover:bg-[#2b27b5] text-white font-bold h-8 text-xs rounded-sm w-full"><Plus className="h-3 w-3 mr-1" /> Inject Package</Button>
              </form>

              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-[10px] font-bold uppercase py-2">ID</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase py-2">Display Name</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase py-2">WBS Element</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase py-2 text-right">Budget</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase py-2">Geospatial</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map(p => (
                    <TableRow key={p.id} className="hover:bg-slate-50/60">
                      <TableCell className="font-bold text-xs">
                        <Badge className="bg-slate-100 text-slate-800 shadow-none font-mono rounded-xs">{p.id}</Badge>
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {p.name} 
                        <Badge className="ml-1 text-[9px] px-1 bg-blue-50 text-blue-700 shadow-none">{p.program}</Badge>
                        {p.isUnplannedInjection && (
                          <Badge className="ml-1 text-[8px] px-1 bg-purple-50 text-purple-700 border border-purple-200 font-bold shadow-none">Change Order</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-slate-500">{p.wbs}</TableCell>
                      <TableCell className="text-xs font-bold text-right">${(p.budget || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-[10px] font-mono text-slate-400">
                        {(p.latitude || 29.53000).toFixed(6)}, {(p.longitude || -98.46000).toFixed(6)}
                      </TableCell>
                      
                      <TableCell className="text-right">
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => {
                            setEditingProjectId(p.id);
                            setEditLat((p.latitude || p.coordinates?.lat || "").toString());
                            setEditLong((p.longitude || p.coordinates?.lng || "").toString());
                            setIsGeoModalOpen(true);
                          }}
                          className="text-xs font-bold text-[#142E88] h-8 hover:bg-blue-50 cursor-pointer px-2 rounded-xs"
                        >
                          Edit Location
                        </Button>
                      </TableCell>
                      
                      <TableCell className="text-right pr-4">
                        <button onClick={() => handleDeleteRecord("admin_projects", p.id)} className="text-slate-400 hover:text-red-600 p-1 cursor-pointer transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* SIDE PANELS CONTROLS */}
        <div className="space-y-6">
          
          {/* 🟢 UPGRADED: PERSONNEL MANAGEMENT BY PROJECT */}
          <Card className="border-slate-200 shadow-sm rounded-sm">
            <CardHeader className="bg-slate-50 border-b py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-purple-600" /> Project Field Roster
              </CardTitle>
              <Badge className="bg-purple-100 text-purple-800 font-mono text-[9px] shadow-none">{selectedProjectId}</Badge>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <form onSubmit={handleAddPerson} className="flex gap-2 items-end border-b pb-4">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Legal Name</label>
                  <Input value={newPerson.name} onChange={e => setNewPerson({...newPerson, name: e.target.value})} placeholder="e.g. Kassaundra Salinas" className="h-8 text-xs rounded-sm" required />
                </div>
                <div className="w-48">
                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Org/Company</label>
                  <Input 
                    value={newPerson.company} 
                    onChange={e => setNewPerson({...newPerson, company: e.target.value})} 
                    placeholder="e.g. Alterman, ComSol" 
                    className="h-8 text-xs rounded-sm" 
                    required 
                  />
                </div>
                <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white font-bold h-8 text-xs rounded-sm px-3"><Plus className="h-3.5 w-3.5" /></Button>
              </form>
              <div className="max-h-52 overflow-y-auto border border-slate-100 rounded-sm">
                <Table>
                  <TableBody>
                    {personnel.map(p => (
                      <TableRow key={p.id} className={`hover:bg-slate-50/50 ${!p.active ? 'opacity-50 bg-slate-50/30' : ''}`}>
                        <TableCell className={`text-xs font-semibold py-2 ${!p.active ? 'line-through text-slate-400' : 'text-slate-800'}`}>{p.name}</TableCell>
                        <TableCell className="py-2"><Badge className="text-[9px] px-1 shadow-none bg-purple-50 text-purple-700">{p.company}</Badge></TableCell>
                        <TableCell className="text-right py-2">
                          <button type="button" onClick={() => togglePersonArchive(p.id, p.active)} className={`p-1 transition-colors rounded-xs ${p.active ? 'text-slate-400 hover:text-amber-600' : 'text-amber-600 hover:text-slate-600'}`}>
                            {p.active ? <Archive className="h-3.5 w-3.5" /> : <CheckCircle className="h-3.5 w-3.5" />}
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* 🟢 NEW: LOCATION PERIMETERS BY PROJECT */}
          <Card className="border-slate-200 shadow-sm rounded-sm mt-4">
            <CardHeader className="bg-slate-50 border-b py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <MapPin className="h-4 w-4 text-amber-600" /> Project Worksite Locations
              </CardTitle>
              <Badge className="bg-amber-100 text-amber-800 font-mono text-[9px] shadow-none">{selectedProjectId}</Badge>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <form onSubmit={handleAddLocation} className="flex gap-2 items-end border-b pb-4">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Worksite Sector Zone / Gate</label>
                  <Input value={newLocation} onChange={e => setNewLocation(e.target.value)} placeholder="e.g. Comm Room 104, Vault Delta" className="h-8 text-xs rounded-sm" required />
                </div>
                <Button type="submit" className="bg-amber-600 hover:bg-amber-700 text-white font-bold h-8 text-xs rounded-sm px-3"><Plus className="h-3.5 w-3.5" /></Button>
              </form>
              <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-sm">
                <Table>
                  <TableBody>
                    {projectLocations.map(l => (
                      <TableRow key={l.id} className="hover:bg-slate-50/50">
                        <TableCell className="text-xs font-medium text-slate-800 py-2">{l.name}</TableCell>
                        <TableCell className="text-right py-2">
                          <button type="button" onClick={() => handleDeleteLocation(l.id)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* PROJECT SECTORS (Kept Intact) */}
          <Card className="border-slate-200 shadow-sm rounded-sm">
            <CardHeader className="bg-slate-50 border-b py-3">
              <CardTitle className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <MapPin className="h-4 w-4 text-amber-600" /> Project Specific Sectors
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <form onSubmit={handleAddSector} className="flex gap-2 items-end border-b pb-4">
                <div className="w-20">
                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Sector Code</label>
                  <Input maxLength={2} value={newSector.code} onChange={e => setNewSector({...newSector, code: e.target.value})} placeholder="04" className="h-8 text-xs font-mono text-center uppercase rounded-sm" required />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Work Pack Target</label>
                  <select value={newSector.projectId} onChange={e => setNewSector({...newSector, projectId: e.target.value})} className="w-full border p-1 text-xs rounded-sm bg-white h-8">
                    <option value="">Select pack...</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.id}</option>)}
                  </select>
                </div>
                <Button type="submit" className="bg-amber-600 hover:bg-amber-700 text-white font-bold h-8 text-xs rounded-sm px-3"><Plus className="h-3.5 w-3.5" /></Button>
              </form>
              <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-sm">
                <Table>
                  <TableBody>
                    {sectors.map(s => (
                      <TableRow key={s.id} className="hover:bg-slate-50/50">
                        <TableCell className="text-xs font-bold font-mono text-amber-700 py-1.5">Sec {s.code}</TableCell>
                        <TableCell className="text-xs text-slate-500 py-1.5">Project: {s.projectId}</TableCell>
                        <TableCell className="text-right py-1.5"><button onClick={() => handleDeleteRecord("admin_sectors", s.id)} className="text-slate-300 hover:text-red-500 p-0.5"><Trash2 className="h-3 w-3" /></button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* KEYWORD WATCHLIST (Kept Intact) */}
          <Card className="border-slate-200 shadow-sm bg-white rounded-sm mt-4">
            <div className="p-4 border-b bg-slate-50/50 flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-[#142E88]" />
              <div>
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Cyber-Physical Watchlist</h3>
                <p className="text-[10px] text-slate-400">Secondary non-vanilla tokens.</p>
              </div>
            </div>
            <CardContent className="p-4 space-y-4">
              <form onSubmit={handleAddKeyword} className="flex gap-2">
                <input placeholder="e.g. conduit pathway, fire alarm" value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)} className="w-full rounded-md border p-2 text-xs bg-white h-9" />
                <Button type="submit" className="h-9 bg-[#142E88] text-white text-xs font-medium px-3 flex items-center gap-1 rounded-sm shrink-0"><Plus className="h-3.5 w-3.5" /> Track</Button>
              </form>
              <div className="space-y-1.5">
                <span className="block font-mono text-[9px] uppercase font-bold text-slate-400 tracking-wider">Active Elements</span>
                <div className="flex flex-wrap gap-2 p-3 bg-slate-50 border rounded-sm min-h-[60px]">
                  {keywords.map((word) => (
                    <Badge key={word} variant="secondary" className="bg-white border-slate-200 shadow-none text-slate-700 text-xs py-1 px-2 font-mono flex items-center gap-1.5 rounded-sm">
                      <span>{word}</span>
                      <button type="button" onClick={() => handleRemoveKeyword(word)} className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                  {keywords.length === 0 && <span className="text-[11px] text-slate-400 font-medium italic m-auto">No tracking keywords defined.</span>}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* GEOSPATIAL VECTOR LOADER (Kept Intact) */}
          <Card className="border-slate-200 shadow-sm rounded-sm">
            <CardHeader className="bg-slate-50 border-b py-3">
              <CardTitle className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <Layers className="h-4 w-4 text-purple-600" /> Executive Multi-File Layer Loader
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="border-2 border-dashed border-slate-200 rounded-sm p-6 text-center bg-slate-50/50 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => document.getElementById('geo-batch-input')?.click()}>
                <HelpCircle className="h-6 w-6 mx-auto text-slate-400 mb-2" />
                <span className="block text-xs font-bold text-slate-700">Drop Manifest & GeoJSON Files Together</span>
                <span className="text-[10px] text-slate-400 mt-0.5 block">Select all 13 terminal layout vector files</span>
                <input 
                  type="file" 
                  id="geo-batch-input"
                  multiple 
                  accept=".json,.geojson" 
                  className="hidden" 
                  onChange={(e) => {
                    const files = e.target.files;
                    if (!files || files.length === 0) return;
                    let uploadedCount = 0; let errorCount = 0;
                    for (let i = 0; i < files.length; i++) {
                      const file = files[i]; const reader = new FileReader();
                      reader.onload = async (event) => {
                        try {
                          let text = event.target?.result as string;
                          if (text.charCodeAt(0) === 0xFEFF) { text = text.slice(1); }
                          text = text.trim();
                          const parsedData = JSON.parse(text);
                          await setDoc(doc(db, "airfield_map_layers", file.name.replace(/\.[^/.]+$/, "")), {
                            layerName: file.name,
                            geometryDataString: JSON.stringify(parsedData),
                            uploadedAt: new Date().toISOString(),
                            status: "Active"
                          });
                          uploadedCount++;
                          if (uploadedCount + errorCount === files.length) {
                            toast({ title: "Batch Stream Synced", description: `Successfully parsed and stored ${uploadedCount} airfield layout layers.` });
                          }
                        } catch (err) {
                          console.error(`Parsing error on file: ${file.name}`, err); errorCount++;
                          toast({ variant: "destructive", title: "File Format Warning", description: `Skipped "${file.name}" due to internal parsing or formatting errors.` });
                        }
                      };
                      reader.readAsText(file);
                    }
                  }} 
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 🌐 CUSTOM GEOSPATIAL EDITING OVERLAY WINDOW */}
      {isGeoModalOpen && (
        <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 shadow-2xl rounded-sm w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-[#142E88] text-white px-4 py-3 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">Update Project Coordinates</h3>
              <button type="button" onClick={() => { setIsGeoModalOpen(false); setEditingProjectId(null); }} className="text-slate-300 hover:text-white p-1 transition-colors cursor-pointer"><span className="font-bold font-sans text-sm">✕</span></button>
            </div>
            {/* Modal Body / Form */}
            <form onSubmit={handleUpdateGeospatialData} className="p-5 space-y-4 text-xs font-medium">
              <div className="text-[11px] text-slate-500 font-mono">
                Project Target Context ID: <span className="font-bold text-[#142E88]">{editingProjectId}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-600 font-semibold block">Latitude</label>
                  <Input 
                    type="number" 
                    step="any" 
                    required 
                    value={editLat} 
                    onChange={e => setEditLat(e.target.value)} 
                    placeholder="e.g., 29.530" 
                    className="bg-white rounded-none border-slate-300 shadow-none text-xs h-9" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-600 font-semibold block">Longitude</label>
                  <Input 
                    type="number" 
                    step="any" 
                    required 
                    value={editLong} 
                    onChange={e => setEditLong(e.target.value)} 
                    placeholder="e.g., -98.460" 
                    className="bg-white rounded-none border-slate-300 shadow-none text-xs h-9" 
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2 border-t mt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => { setIsGeoModalOpen(false); setEditingProjectId(null); }} 
                  className="flex-1 rounded-none border-slate-200 text-slate-500 h-9 font-bold text-xs cursor-pointer hover:bg-slate-50"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="flex-1 bg-[#142E88] hover:bg-[#1f3bb0] text-white rounded-none h-9 font-bold text-xs cursor-pointer"
                >
                  Save Coordinates
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}