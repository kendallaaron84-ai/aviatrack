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

const STAGES = ["Construction", "Commission", "ORAT Trials", "Close-Out - Operations"];
const WEATHER_OPTIONS = ["Raining", "Dry", "Hot", "Cold"];
const OBSERVATION_TYPES = ["General", "Risk", "Safety", "Change Request"];
const PRIORITIES = ["Low", "Medium", "High"];

export default function FieldIntakePage() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittedSuccessfully, setIsSubmittedSuccessfully] = useState(false);

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
    });
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
    });

    const unsubPers = onSnapshot(collection(db, "admin_projects", project, "personnel"), (snap) => {
      const activePersonnel = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.active !== false);
      setPersonnel(activePersonnel);
    });

    return () => { unsubLocs(); unsubPers(); };
  }, [project]);

  // 📋 SAFEGUARD: Local Storage Autosave Draft Layer
  useEffect(() => {
    const savedDraft = localStorage.getItem("field_observation_draft");
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        if (Array.isArray(parsed)) setObservationsList(parsed);
      } catch (e) {
        console.error("Failed to re-hydrate field draft state", e);
      }
    }
  }, []);

  useEffect(() => {
    if (observationsList.length > 0) {
      // Stripping out raw File instances to avoid local storage serialization crashes
      const cleanDraft = observationsList.map(obs => ({
        ...obs,
        attachedFiles: [] 
      }));
      localStorage.setItem("field_observation_draft", JSON.stringify(cleanDraft));
    }
  }, [observationsList]);

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
        status: "Needs Verification"
      };

      const docRef = await addDoc(collection(db, "field_observations"), fieldReportPayload);

      for (const obs of observationsList) {
        const cloudImageUrls: string[] = [];

        // Chunked Resumable Upload pipeline for multiple photos
        if (obs.attachedFiles && obs.attachedFiles.length > 0) {
          for (const file of obs.attachedFiles) {
            const fileExtension = file.name.split('.').pop() || 'jpg';
            const storagePath = `field_evidence/${docRef.id}-${obs.id}-${crypto.randomUUID()}.${fileExtension}`;
            const storageRefInstance = storageRef(storageInstance, storagePath);
            
            const uploadTask = uploadBytesResumable(storageRefInstance, file);

            const downloadUrl = await new Promise<string>((resolve, reject) => {
              uploadTask.on(
                "state_changed",
                null,
                (error) => reject(error),
                async () => {
                  const url = await getDownloadURL(uploadTask.snapshot.ref);
                  resolve(url);
                }
              );
            });
            cloudImageUrls.push(downloadUrl);
          }
        }

        await addDoc(collection(db, "field_observations", docRef.id, "sub_observations"), {
          observationId: obs.id,
          observationType: obs.type,
          priority: obs.priority,
          description: obs.description,
          createdAt: submissionTimestamp,
          itemPhotos: cloudImageUrls
        });
      }

      localStorage.removeItem("field_observation_draft"); 
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
    </div>
  );
}