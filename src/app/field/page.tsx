// File: src/app/field/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plane, CloudSun, Building2, ArrowLeft, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea"; 
import Link from "next/link";
import { getAuth } from "firebase/auth";

// Centralized Firebase Imports + Added Storage Tools
import { db, auth } from "@/lib/firebase";
import { collection, onSnapshot, addDoc } from "firebase/firestore";
import { getStorage, ref as storageRef, getDownloadURL, uploadBytesResumable } from "firebase/storage";
import { formatItemNumber } from "@/lib/field-observation-utils";

const STAGES = ["Construction", "Commission", "ORAT Trials", "Close-Out - Operations"];
const WEATHER_OPTIONS = ["Raining", "Dry", "Hot", "Cold"];
const OBSERVATION_TYPES = ["General", "Risk", "Safety", "Change Request"];
const PRIORITIES = ["Low", "Medium", "High"];

const getObservationPhotos = (obs: any): string[] => {
  if (Array.isArray(obs.photos) && obs.photos.length > 0) return obs.photos;
  if (Array.isArray(obs.photoUrls) && obs.photoUrls.length > 0) return obs.photoUrls;
  if (Array.isArray(obs.attachments) && obs.attachments.length > 0) return obs.attachments;
  if (typeof obs.imageUrl === 'string' && obs.imageUrl.trim() !== '') return [obs.imageUrl];
  if (typeof obs.photoUrl === 'string' && obs.photoUrl.trim() !== '') return [obs.photoUrl];
  return [];
};

export default function FieldIntakePage() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittedSuccessfully, setIsSubmittedSuccessfully] = useState(false);
  
  // Resumable upload tracking states
  const [uploadProgressList, setUploadProgressList] = useState<any[]>([]);
  // Local storage draft restore tracking state
  const [savedDraftExists, setSavedDraftExists] = useState(false);

  // Dynamic PM Workspace Data Streams
  const [projects, setProjects] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [personnel, setPersonnel] = useState<any[]>([]);

  // Parameter states
  const [program, setProgram] = useState("TDP");
  const [project, setProject] = useState("");
  const [stage, setStage] = useState("Construction");
  const [location, setLocation] = useState("");
  const [isExterior, setIsExterior] = useState(false);
  const [weather, setWeather] = useState("Dry");
  const [buildingLevel, setBuildingLevel] = useState("Level 1");
  const [sector, setSector] = useState("");
  const [selectedPersonnel, setSelectedPersonnel] = useState<string[]>([]);

  // Multi-photo schema initialization
  const [observationsList, setObservationsList] = useState<any[]>([
    { id: crypto.randomUUID(), type: "General", priority: "Low", description: "", attachedFiles: [], previewUrls: [] }
  ]);

  // 1. Stream Master Admin Project Directory
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "admin_projects"), (snap) => {
      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => console.error("Firestore admin_projects listener error:", error));
    return () => unsub();
  }, []);

  // 2. Filter available projects by selected Program Track (TDP vs CIP)
  const filteredProjects = projects.filter(p => p.program === program);

  // Auto-select the first project in the list when the program changes
  useEffect(() => {
    if (filteredProjects.length > 0 && !filteredProjects.find(p => p.id === project)) {
      setProject(filteredProjects[0].id);
    } else if (filteredProjects.length === 0) {
      setProject("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, projects]);

  // 3. Cascade Locations and Personnel based on Active Project Target
  useEffect(() => {
    if (!project) {
      setLocations([]);
      setPersonnel([]);
      return;
    }

    const unsubLocs = onSnapshot(collection(db, "admin_projects", project, "locations"), (snap) => {
      setLocations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => console.error("Firestore project locations listener error:", error));

    const unsubPers = onSnapshot(collection(db, "admin_projects", project, "personnel"), (snap) => {
      const activePersonnel = snap.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter(p => p.active !== false);
      setPersonnel(activePersonnel);
    }, (error) => console.error("Firestore project personnel listener error:", error));

    return () => { unsubLocs(); unsubPers(); };
  }, [project]);

  // 📋 OFFLINE RESILIENCE: Check for existing draft on component mount
  useEffect(() => {
    const savedDraft = localStorage.getItem("field_observation_full_draft");
    if (savedDraft) {
      setSavedDraftExists(true);
    }
  }, []);

  const handleRestoreDraft = () => {
    const saved = localStorage.getItem("field_observation_full_draft");
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        if (draft.program) setProgram(draft.program);
        if (draft.project) setProject(draft.project);
        if (draft.stage) setStage(draft.stage);
        if (draft.location) setLocation(draft.location);
        if (draft.isExterior !== undefined) setIsExterior(draft.isExterior);
        if (draft.weather) setWeather(draft.weather);
        if (draft.buildingLevel) setBuildingLevel(draft.buildingLevel);
        if (draft.sector) setSector(draft.sector);
        if (draft.selectedPersonnel) setSelectedPersonnel(draft.selectedPersonnel);
        if (draft.observationsList) setObservationsList(draft.observationsList);
        
        toast({ title: "Draft Restored", description: "Your previously saved field log has been restored." });
      } catch (err) {
        console.error("Failed to restore draft:", err);
        toast({ variant: "destructive", title: "Restore Failed", description: "The draft was corrupted or incomplete." });
      }
    }
    setSavedDraftExists(false);
  };

  const handleDiscardDraft = () => {
    localStorage.removeItem("field_observation_full_draft");
    setSavedDraftExists(false);
    toast({ title: "Draft Discarded", description: "Your local field log draft has been cleared." });
  };

  // 🕒 ENHANCEMENT 1: 30-Second Background Autosave Interval
  useEffect(() => {
    const interval = setInterval(() => {
      // Don't autosave if already submitted successfully
      if (isSubmittedSuccessfully) return;

      const draftPayload = {
        program,
        project,
        stage,
        location,
        isExterior,
        weather,
        buildingLevel,
        sector,
        selectedPersonnel,
        observationsList: observationsList.map(obs => ({
          id: obs.id,
          type: obs.type,
          priority: obs.priority,
          description: obs.description,
          previewUrls: obs.previewUrls || [],
          attachedFiles: [] // strip non-serializable File instances
        }))
      };

      try {
        localStorage.setItem("field_observation_full_draft", JSON.stringify(draftPayload));
        console.log("Offline Resilience: Form state autosaved to local draft.");
      } catch (err) {
        console.error("Offline Resilience: Autosave write failure:", err);
      }
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [program, project, stage, location, isExterior, weather, buildingLevel, sector, selectedPersonnel, observationsList, isSubmittedSuccessfully]);

  const handlePersonnelToggle = (name: string) => {
    setSelectedPersonnel(prev => 
      prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name]
    );
  };

  const addObservationItem = async () => {
    // 🔐 SAFEGUARD: Reset the 1-hour authentication timeout wall when adding entries
    try {
      const authInstance = getAuth();
      if (authInstance.currentUser) {
        await authInstance.currentUser.getIdToken(true);
        console.log("Session validity token extended successfully.");
      }
    } catch (e) {
      console.warn("Utilizing session authentication token cache.");
    }

    setObservationsList([
      ...observationsList, 
      { id: crypto.randomUUID(), type: "General", priority: "Low", description: "", attachedFiles: [], previewUrls: [] }
    ]);
  };

  const removeObservationItem = (id: string) => {
    if (observationsList.length === 1) return;
    setObservationsList(observationsList.filter(item => item.id !== id));
  };

  const updateObservationField = (id: string, field: string, value: string) => {
    setObservationsList(observationsList.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleFormSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return; 
    setIsSubmitting(true);
    setUploadProgressList([]); // reset progress tracker

    try {
      const authInstance = getAuth();
      const currentUser = authInstance.currentUser;

      if (!currentUser) {
        throw new Error("No active session found. Please re-authenticate.");
      }

      // 🔐 SAFEGUARD: Reset the 1-hour expiration barrier right at submission execution
      await currentUser.getIdToken(true);

      const emailUser = currentUser.email || "Kendall Aaron";
      const submissionTimestamp = new Date().toISOString();
      const storageInstance = getStorage();

      const activeProjectObj = projects.find(p => p.id === project);
      const projectDisplayName = activeProjectObj ? activeProjectObj.name : project;

      // [ENHANCEMENT 4] Normalization search tags for the parent observation
      const parentTextPool = [
        emailUser,
        program,
        project,
        projectDisplayName || "",
        stage,
        location,
        isExterior ? "exterior" : "interior",
        isExterior ? weather : "controlled",
        buildingLevel,
        sector || "00",
        selectedPersonnel.join(" "),
        "Needs Verification"
      ].join(" ").toLowerCase();
      
      const parent_search_tags = Array.from(new Set(parentTextPool.split(/[\s,.;:!?()"/#&\-_]+/).filter(w => w.length > 1)));

      const fieldReportPayload = {
        submittedBy: emailUser,
        submittedAt: submissionTimestamp,
        program,
        projectId: project,
        projectName: projectDisplayName,
        stage,
        location,
        isExterior,
        weather: isExterior ? weather : "Controlled",
        buildingLevel,
        sector: sector || "00",
        presentAtSite: selectedPersonnel.join(", "), 
        status: "Needs Verification",
        search_tags: parent_search_tags
      };

      const idToken = await currentUser.getIdToken();
      const allocationResponse = await fetch("/api/field-observations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify(fieldReportPayload),
      });
      const allocation = await allocationResponse.json();
      if (!allocationResponse.ok) throw new Error(allocation.error || "Unable to allocate Field Observation number.");
      const docRef = { id: allocation.id };

      // Pre-calculate progress tracking items for files
      const progressItems: any[] = [];
      const uploadsToRun: { id: string; file: File; obsId: string; storageRefInstance: any }[] = [];

      for (const [observationIndex, obs] of observationsList.entries()) {
        if (obs.attachedFiles && obs.attachedFiles.length > 0) {
          for (const file of obs.attachedFiles) {
            const uId = crypto.randomUUID();
            const fileExtension = file.name.split('.').pop() || 'jpg';
            const storagePath = `field_evidence/${docRef.id}-${obs.id}-${uId}.${fileExtension}`;
            const storageRefInstance = storageRef(storageInstance, storagePath);
            
            progressItems.push({
              id: uId,
              fileName: file.name,
              bytesTransferred: 0,
              totalBytes: file.size,
              percentage: 0,
              status: 'running',
              task: null
            });

            uploadsToRun.push({
              id: uId,
              file,
              obsId: obs.id,
              storageRefInstance
            });
          }
        }
      }

      setUploadProgressList(progressItems);

      const cloudUrlsByObs: Record<string, string[]> = {};

      // Run uploads sequentially with progress hook
      for (const item of uploadsToRun) {
        const uploadTask = uploadBytesResumable(item.storageRefInstance, item.file);

        // Bind active upload task to tracking list
        setUploadProgressList(prev => prev.map(p => p.id === item.id ? { ...p, task: uploadTask } : p));

        const downloadUrl = await new Promise<string>((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snapshot) => {
              const bytesTransferred = snapshot.bytesTransferred;
              const totalBytes = snapshot.totalBytes;
              const percentage = totalBytes > 0 ? Math.round((bytesTransferred / totalBytes) * 100) : 0;
              
              let status: 'running' | 'paused' | 'success' | 'error' = 'running';
              if (snapshot.state === 'paused') {
                status = 'paused';
              }

              setUploadProgressList(prev => prev.map(p => p.id === item.id ? {
                ...p,
                bytesTransferred,
                totalBytes,
                percentage,
                status
              } : p));
            },
            (error) => {
              setUploadProgressList(prev => prev.map(p => p.id === item.id ? { ...p, status: 'error' } : p));
              reject(error);
            },
            async () => {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              setUploadProgressList(prev => prev.map(p => p.id === item.id ? { ...p, status: 'success', percentage: 100 } : p));
              resolve(url);
            }
          );
        });

        if (!cloudUrlsByObs[item.obsId]) {
          cloudUrlsByObs[item.obsId] = [];
        }
        cloudUrlsByObs[item.obsId].push(downloadUrl);
      }

      for (const [observationIndex, obs] of observationsList.entries()) {
        const cloudImageUrls = cloudUrlsByObs[obs.id] || [];

        // [ENHANCEMENT 4] Normalization search tags for the sub-observation
        const subTextPool = [
          obs.type || "",
          obs.priority || "",
          obs.description || ""
        ].join(" ").toLowerCase();
        const sub_search_tags = Array.from(new Set(subTextPool.split(/[\s,.;:!?()"/#&\-_]+/).filter(w => w.length > 1)));

        await addDoc(collection(db, "field_observations", docRef.id, "sub_observations"), {
          observationId: obs.id,
          observationType: obs.type,
          priority: obs.priority,
          description: obs.description,
          createdAt: submissionTimestamp,
          itemPhotos: cloudImageUrls,
          search_tags: sub_search_tags,
          itemNumber: formatItemNumber(allocation.sequenceNumber, observationIndex + 1),
          itemSequence: observationIndex + 1,
          reportNumber: allocation.reportNumber,
          reportSequence: allocation.sequenceNumber,
          parentObservationId: docRef.id,
        });
      }

      localStorage.removeItem("field_observation_full_draft"); 
      setIsSubmittedSuccessfully(true);
      toast({ title: "Report Saved", description: "All observations pushed to the PM verification queue." });

    } catch (err: any) {
      console.error("Field submission pipeline crash:", err);
      toast({ 
        variant: "destructive", 
        title: "Submission Failed", 
        description: err.message || "Network packet dropout encountered." 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetFormState = () => {
    setObservationsList([{ id: crypto.randomUUID(), type: "General", priority: "Low", description: "", attachedFiles: [], previewUrls: [] }]);
    setSector("");
    setSelectedPersonnel([]);
    setIsSubmittedSuccessfully(false);
  };

  if (isSubmittedSuccessfully) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <Card className="max-w-md w-full border border-slate-200 shadow-sm rounded-none text-center p-8 bg-white space-y-6">
          <div className="bg-emerald-50 text-emerald-600 rounded-full p-3 h-14 w-14 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-900">Submission Confirmed</h2>
            <p className="text-sm text-slate-500">Field report processed and synchronized to the Project Manager Dashboard.</p>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={resetFormState} className="bg-[#142E88] hover:bg-[#142E88]/90 text-white rounded-sm font-semibold h-11 w-full text-sm">
              Log Another Report
            </Button>
            <Button variant="outline" asChild className="rounded-sm border-slate-300 h-11 w-full text-xs font-semibold text-slate-600 bg-white">
              <Link href="/dashboard">Return to Dashboard</Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          <Plane className="h-6 w-6 text-[#142E88]" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">Field Intake Portal</h1>
            <p className="text-xs text-slate-500">Log construction package deviations and active hazards.</p>
          </div>
        </div>
        
        <Button variant="outline" size="sm" asChild className="rounded-sm border-slate-300 gap-2 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50">
          <Link href="/dashboard">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
          </Link>
        </Button>
      </div>

      {/* 🔮 OFFLINE RESILIENCE: DRAFT RESTORE TOP BANNER */}
      {savedDraftExists && (
        <Card className="border border-blue-200 bg-blue-50/50 p-4 rounded-sm shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-sans">
          <div className="flex items-start gap-3">
            <CloudSun className="h-5 w-5 text-[#142E88] mt-0.5 shrink-0" />
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Unsaved Field Draft Detected</h4>
              <p className="text-[11px] text-slate-600 leading-normal">
                We found a local draft saved during your last active walk. Would you like to restore or discard these observations?
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button 
              type="button"
              size="sm"
              onClick={handleRestoreDraft}
              className="bg-[#142E88] hover:bg-blue-800 text-white font-bold text-[10px] h-8 rounded-xs px-3 shadow-xs cursor-pointer uppercase tracking-wider"
            >
              Restore Draft
            </Button>
            <Button 
              type="button"
              size="sm"
              variant="outline"
              onClick={handleDiscardDraft}
              className="border-slate-200 text-slate-500 hover:bg-slate-100 bg-white font-bold text-[10px] h-8 rounded-xs px-3 cursor-pointer uppercase tracking-wider"
            >
              Discard
            </Button>
          </div>
        </Card>
      )}

      {/* INTERACTIVE INPUT FORM LAYER */}
      <form onSubmit={handleFormSubmission} className="space-y-6 print:hidden">
        <Card className="rounded-none border shadow-none bg-white">
          <CardHeader className="bg-slate-50/60 border-b py-3">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">1. Report Parameters Header</CardTitle>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">Program Track</label>
              <select value={program} onChange={e => setProgram(e.target.value)} className="w-full border p-2 rounded-sm bg-white h-10">
                <option value="TDP">TDP (Terminal Development Program)</option>
                <option value="CIP">CIP (Capital Improvement Program)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">Project Work Package</label>
              <select value={project} onChange={e => setProject(e.target.value)} className="w-full border p-2 rounded-sm bg-white h-10">
                <option value="">Select Project Target...</option>
                {filteredProjects.map(p => (
                  <option key={p.id} value={p.id}>{p.id} — {p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">Execution Stage</label>
              <select value={stage} onChange={e => setStage(e.target.value)} className="w-full border p-2 rounded-sm bg-white h-10">
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">Worksite Location</label>
              <select value={location} onChange={e => setLocation(e.target.value)} className="w-full border p-2 rounded-sm bg-white h-10" disabled={!project}>
                <option value="">{project ? "Select Specific Location..." : "Select a Project first..."}</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.name}>{loc.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">Building Level</label>
                <select value={buildingLevel} onChange={e => setBuildingLevel(e.target.value)} className="w-full border p-2 rounded-sm bg-white h-10">
                  <option value="Level 0">Level 0</option>
                  <option value="Level 1">Level 1</option>
                  <option value="Level 2">Level 2</option>
                  <option value="Level 3">Level 3</option>
                  <option value="Roof">Roof System</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">Sector (2-Digit)</label>
                <input type="text" maxLength={2} placeholder="00" value={sector} onChange={e => setSector(e.target.value)} className="w-full border p-2 rounded-sm bg-white h-10 tracking-widest font-mono text-center" />
              </div>
            </div>

            <div className="md:col-span-2 border rounded-sm p-4 bg-slate-50/50">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 text-slate-500">Present at Site Log</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-2 bg-white border border-slate-200 rounded-sm">
                {personnel.map(person => (
                  <div key={person.id} className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      id={`person-${person.id}`}
                      checked={selectedPersonnel.includes(person.name)}
                      onChange={() => handlePersonnelToggle(person.name)}
                      className="h-3.5 w-3.5 rounded-sm border-slate-300 text-[#142E88] focus:ring-[#142E88] cursor-pointer"
                    />
                    <label htmlFor={`person-${person.id}`} className="text-xs font-medium text-slate-700 cursor-pointer select-none">
                      {person.name} <span className="text-[10px] text-slate-400">({person.company})</span>
                    </label>
                  </div>
                ))}
                {personnel.length === 0 && <span className="text-xs text-slate-400 italic">No active personnel assigned to this project yet.</span>}
              </div>
            </div>

            <div className="md:col-span-2 pt-2 border-t flex items-center justify-between">
              <button type="button" onClick={() => setIsExterior(!isExterior)} className={`flex items-center gap-2 px-4 py-2 border rounded-sm transition-colors text-xs font-bold ${isExterior ? 'bg-amber-50 text-amber-800 border-amber-300' : 'bg-slate-50 text-slate-700 border-slate-300'}`}>
                {isExterior ? <CloudSun className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                <span>Track Environment: {isExterior ? "Exterior Worksite" : "Interior Facility Room"}</span>
              </button>

              {isExterior && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600">Active Weather:</span>
                  <select value={weather} onChange={e => setWeather(e.target.value)} className="border p-1.5 text-xs rounded-sm bg-white w-32 h-9">
                    {WEATHER_OPTIONS.map(w => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">2. Active Observations Matrix</h2>
            <Button type="button" onClick={addObservationItem} variant="outline" size="sm" className="bg-[#142E88] text-white hover:bg-[#142E88]/90 text-xs rounded-sm h-8 cursor-pointer">
              <Plus className="mr-1 h-3.5 w-3.5" /> Append Observation Entry
            </Button>
          </div>

          {observationsList.map((obs, idx) => (
            <Card key={obs.id} className="rounded-none border border-slate-200 shadow-none bg-white relative">
              <div className="bg-slate-50 border-b px-4 py-2 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 font-mono">OBS-ENTRY #{idx + 1}</span>
                {observationsList.length > 1 && (
                  <button type="button" onClick={() => removeObservationItem(obs.id)} className="text-slate-400 hover:text-red-600 p-1 cursor-pointer transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Observation Class</label>
                  <select value={obs.type} onChange={e => updateObservationField(obs.id, "type", e.target.value)} className="w-full border p-2 text-xs rounded-sm bg-white h-9">
                    {OBSERVATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Field Priority Level</label>
                  <select value={obs.priority} onChange={e => updateObservationField(obs.id, "priority", e.target.value)} className="w-full border p-2 text-xs rounded-sm bg-white h-9">
                    {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-800 mb-1">Field Description Notes</label>
                  <Textarea value={obs.description} onChange={e => updateObservationField(obs.id, "description", e.target.value)} placeholder="Describe active anomalies..." rows={3} className="bg-white rounded-none border-slate-300 shadow-none resize-none text-sm placeholder:text-slate-300" />
                </div>

                <div className="md:col-span-2 pt-2 space-y-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Evidence Photo Documentation (Multiple Images Supported)
                  </label>
                  
                  <div className="bg-slate-50 p-4 border rounded-sm space-y-3">
                    <div className="flex items-center gap-4">
                      <input
                        type="file"
                        id={`file-capture-${obs.id}`}
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          const chosenFiles = e.target.files ? Array.from(e.target.files) : [];
                          if (chosenFiles.length === 0) return;
                          
                          const newPreviews = chosenFiles.map(file => URL.createObjectURL(file));

                          setObservationsList(observationsList.map(item => {
                            if (item.id === obs.id) {
                              return {
                                ...item,
                                attachedFiles: [...(item.attachedFiles || []), ...chosenFiles],
                                previewUrls: [...(item.previewUrls || []), ...newPreviews]
                              };
                            }
                            return item;
                          }));
                        }}
                      />

                      <button
                        type="button"
                        onClick={() => document.getElementById(`file-capture-${obs.id}`)?.click()}
                        className="flex items-center justify-center gap-2 border border-dashed border-slate-300 bg-white hover:bg-slate-100 px-4 py-2.5 rounded-sm text-xs font-bold text-slate-700 font-mono transition-colors cursor-pointer"
                      >
                        <svg className="h-4 w-4 text-[#142E88]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Tap to Capture / Attach Photos
                      </button>

                      <span className="text-[11px] text-slate-400 font-mono ml-auto">
                        {(obs.attachedFiles?.length || 0)} Attached
                      </span>
                    </div>

                    {obs.previewUrls && obs.previewUrls.length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200">
                        {obs.previewUrls.map((url: string, idx: number) => (
                          <div key={idx} className="relative h-14 w-20 border rounded bg-slate-900 overflow-hidden shrink-0 group">
                            <img src={url} alt={`Preview ${idx + 1}`} className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => {
                                URL.revokeObjectURL(url);
                                setObservationsList(observationsList.map(item => {
                                  if (item.id === obs.id) {
                                    return {
                                      ...item,
                                      attachedFiles: item.attachedFiles.filter((_: any, fIdx: number) => fIdx !== idx),
                                      previewUrls: item.previewUrls.filter((_: any, pIdx: number) => pIdx !== idx)
                                    };
                                  }
                                  return item;
                                }));
                              }}
                              className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[9px] font-bold transition-opacity cursor-pointer"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400 italic pt-2 border-t border-dashed text-center">
                        No image markers bound to this observation window yet.
                      </div>
                    )}
                  </div>
                </div>

                {(() => {
                  const photos = getObservationPhotos(obs);
                  if (photos.length === 0) return null;

                  return (
                    <div className="grid grid-cols-2 gap-2 my-2 md:col-span-2">
                      {photos.map((url, idx) => (
                        <img
                          key={idx}
                          src={url}
                          alt={`Observation photo ${idx + 1}`}
                          className="w-full h-32 object-cover rounded-md border border-slate-700"
                          onError={(e) => {
                            // Hide broken image tags gracefully if URL expires or fails to load
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ))}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button type="submit" disabled={isSubmitting} className="bg-[#142E88] hover:bg-[#1f3ab3] text-white font-bold rounded-sm h-11 px-8 text-sm shadow-sm cursor-pointer">
            {isSubmitting ? "Transmitting Field Pack..." : "Submit All Field Logs"}
          </Button>
        </div>
      </form>

      {/* 🖨️ STATIC COMPLIANT PRINT LAYER FOR FIELD OBSERVATION FORMS */}
      <div className="hidden print:block w-full max-w-5xl mx-auto p-4 bg-white text-black text-sm">
        <div className="border-b pb-4 mb-6 flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight">Field Observation Report Form</h1>
            <p className="text-xs text-slate-500 font-mono">System Source: AviaITrack Core Compliance Engine</p>
          </div>
          <div className="text-right text-xs font-mono">
            <p><strong>Program Track:</strong> {program}</p>
            <p><strong>Project Target:</strong> {project}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-2 border p-4 bg-slate-50 mb-6 rounded-sm">
          <p><strong>Execution Phase Stage:</strong> {stage}</p>
          <p><strong>Worksite Location Marker:</strong> {location || "Not Provided"}</p>
          <p><strong>Facility Environment Context:</strong> {isExterior ? `Exterior (${weather})` : "Controlled Facility Interior"}</p>
          <p><strong>Structural Marker Designation:</strong> {buildingLevel} / Sector {sector || "00"}</p>
          <p className="col-span-2"><strong>Personnel Checklist Present at Site:</strong> {selectedPersonnel.join(", ") || "None Logged"}</p>
        </div>

        <h3 className="text-md font-bold uppercase tracking-wider mb-3 pb-1 border-b">Observation Matrix Summary Log</h3>
        
        <div className="space-y-6">
          {observationsList.map((obs, index) => (
            <div key={obs.id} className="border p-4 rounded-sm bg-white page-break-inside-avoid">
              <div className="flex justify-between items-center bg-slate-100 p-2 mb-3 border font-mono text-xs font-bold">
                <span>OBSERVATION SLOT ENTRY #{index + 1}</span>
                <span className="uppercase text-slate-600">Priority: {obs.priority} | Type: {obs.type}</span>
              </div>
              <p className="text-sm border p-3 bg-slate-50/50 min-h-[50px] whitespace-pre-wrap rounded-sm mb-3">
                {obs.description || "No specific logging narrative descriptions recorded."}
              </p>

              {obs.previewUrls && obs.previewUrls.length > 0 && (
                <div className="grid grid-cols-2 gap-4 mt-2">
                  {obs.previewUrls.map((url: string, pIdx: number) => (
                    <div key={pIdx} className="border p-2 rounded bg-white shadow-sm flex flex-col justify-between">
                      <img src={url} alt={`Evidence Track ${pIdx + 1}`} className="w-full h-44 object-cover rounded" />
                      <div className="mt-2">
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 underline font-mono block truncate">
                          Open High-Res Original Source [Photo {pIdx + 1}]
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 🔮 RESUMABLE MULTI-PHOTO UPLOAD PROGRESS DRAWER */}
      {uploadProgressList.length > 0 && (
        <div className="fixed bottom-6 right-6 w-96 bg-slate-900/95 backdrop-blur-md border border-slate-700/60 rounded-lg shadow-2xl p-4 text-white z-50 space-y-3 font-sans print:hidden animate-in slide-in-from-bottom duration-300">
          <div className="flex items-center justify-between border-b border-slate-700/50 pb-2">
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent" />
              <h3 className="text-xs font-bold uppercase tracking-wider">Uploading Evidence Pack</h3>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              {uploadProgressList.filter(p => p.status === 'success').length} / {uploadProgressList.length} Complete
            </span>
          </div>
          
          <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
            {uploadProgressList.map((item) => (
              <div key={item.id} className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] truncate max-w-[180px]" title={item.fileName}>
                    {item.fileName}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-[10px] text-slate-400">
                      {item.percentage}%
                    </span>
                    {item.status === 'running' && (
                      <button
                        type="button"
                        onClick={() => {
                          if (item.task) {
                            item.task.pause();
                            setUploadProgressList(prev => prev.map(p => p.id === item.id ? { ...p, status: 'paused' } : p));
                          }
                        }}
                        className="text-[9px] bg-slate-800 hover:bg-slate-700 px-1.5 py-0.5 rounded border border-slate-700 cursor-pointer text-white"
                      >
                        Pause
                      </button>
                    )}
                    {item.status === 'paused' && (
                      <button
                        type="button"
                        onClick={() => {
                          if (item.task) {
                            item.task.resume();
                            setUploadProgressList(prev => prev.map(p => p.id === item.id ? { ...p, status: 'running' } : p));
                          }
                        }}
                        className="text-[9px] bg-blue-600 hover:bg-blue-500 px-1.5 py-0.5 rounded cursor-pointer text-white"
                      >
                        Resume
                      </button>
                    )}
                    {item.status === 'success' && (
                      <span className="text-[9px] text-emerald-400 font-bold uppercase">Success</span>
                    )}
                    {item.status === 'error' && (
                      <span className="text-[9px] text-rose-400 font-bold uppercase">Error</span>
                    )}
                  </div>
                </div>
                
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ${
                      item.status === 'success' ? 'bg-emerald-500' :
                      item.status === 'error' ? 'bg-rose-500' :
                      item.status === 'paused' ? 'bg-amber-500' :
                      'bg-blue-500 animate-pulse'
                    }`}
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
