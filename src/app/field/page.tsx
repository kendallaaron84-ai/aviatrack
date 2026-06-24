// File: src/app/field/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plane, CloudSun, Building2, ArrowLeft, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea"; 
import Link from "next/link";

// Centralized Firebase Imports + Added Storage Tools
import { db, auth } from "@/lib/firebase";
import { collection, onSnapshot, addDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage"; // 🟢 ADDED

const STAGES = ["Construction", "Commission", "ORAT Trials", "Close-Out - Operations"];
const WEATHER_OPTIONS = ["Raining", "Dry", "Hot", "Cold"];
const OBSERVATION_TYPES = ["General", "Risk", "Safety", "Change Request"];
const PRIORITIES = ["Low", "Medium", "High"];

export default function FieldIntakePage() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittedSuccessfully, setIsSubmittedSuccessfully] = useState(false);

  // 🟢 NEW: Dynamic PM Workspace Data Streams
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

  const [observationsList, setObservationsList] = useState<any[]>([
    { id: crypto.randomUUID(), type: "General", priority: "Low", description: "", attachedFile: null, previewUrl: "" }
  ]);

  // 🟢 1. Stream Master Admin Project Directory
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "admin_projects"), (snap) => {
      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // 🟢 2. Filter available projects by selected Program Track (TDP vs CIP)
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

  // 🟢 3. Cascade Locations and Personnel based on Active Project Target
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
      // Automatically filters out archived/inactive personnel!
      const activePersonnel = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.active !== false);
      setPersonnel(activePersonnel);
    });

    return () => { unsubLocs(); unsubPers(); };
  }, [project]);

  const handlePersonnelToggle = (name: string) => {
    setSelectedPersonnel(prev => 
      prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name]
    );
  };

  const addObservationItem = () => {
    setObservationsList([...observationsList, { id: crypto.randomUUID(), type: "General", priority: "Low", description: "", attachedFile: null, previewUrl: "" }]);
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
      const currentUser = auth.currentUser?.email || "Kendall Aaron";
      const submissionTimestamp = new Date().toISOString();
      const storageInstance = getStorage(); // Initialize storage

      // Get display name for the payload
      const activeProjectObj = projects.find(p => p.id === project);
      const projectDisplayName = activeProjectObj ? activeProjectObj.name : project;

      // 1. Core parent document properties
      const fieldReportPayload = {
        submittedBy: currentUser,
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

      // 2. Loop, upload raw binary to cloud, and bind the cloud URL to its unique sub-observation block
      for (const obs of observationsList) {
        let finalCloudImageUrl = "";

        // If the user took or attached an active file, upload it to the cloud storage bucket first
        if (obs.attachedFile) {
          const fileExtension = obs.attachedFile.name.split('.').pop() || 'jpg';
          const storagePath = `field_evidence/${docRef.id}-${obs.id}.${fileExtension}`;
          const storageRef = ref(storageInstance, storagePath);
          
          // Upload raw binary payload
          await uploadBytes(storageRef, obs.attachedFile);
          
          // Download the permanent cloud-resolved URL asset link
          finalCloudImageUrl = await getDownloadURL(storageRef);
        }

        // Commit the sub-observation data row alongside its verified cloud image link
        await addDoc(collection(db, "field_observations", docRef.id, "sub_observations"), {
          observationId: obs.id,
          observationType: obs.type,
          priority: obs.priority,
          description: obs.description,
          createdAt: submissionTimestamp,
          itemPhoto: finalCloudImageUrl // 🟢 Fixed: Saved the real storage link, not the local blob URL
        });
      }

      setIsSubmittedSuccessfully(true);
      toast({ title: "Report Saved", description: "All observations pushed to the PM verification queue." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Submission Failed", description: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetFormState = () => {
    setObservationsList([{ id: crypto.randomUUID(), type: "General", priority: "Low", description: "" }]);
    setSector("");
    setSelectedPersonnel([]);
    setIsSubmittedSuccessfully(false);
  };

  // POST-SUBMISSION SUCCESS VIEW LAYER
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

      <form onSubmit={handleFormSubmission} className="space-y-6">
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

            {/* 🟢 FIXED: DYNAMIC PERSONNEL LOG */}
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

                {/* FIELD DESCRIPTION NOTES TEXTAREA RESIDES HERE */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-800 mb-1">Field Description Notes</label>
                  <Textarea value={obs.description} onChange={e => updateObservationField(obs.id, "description", e.target.value)} placeholder="Describe active anomalies..." rows={3} className="bg-white rounded-none border-slate-300 shadow-none resize-none text-sm placeholder:text-slate-300" />
                </div>

                {/* 🟢 ENTERPRISE CAMERA & GALLERY ATTACHMENT HUB 🟢 */}
                <div className="md:col-span-2 pt-2 space-y-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Evidence Photo Documentation
                  </label>
                  
                  <div className="flex items-center gap-4 bg-slate-50 p-3 border rounded-sm">
                    {/* HIDDEN INHERENT MEDIA REGISTER INPUT */}
                    <input
                      type="file"
                      id={`file-capture-${obs.id}`}
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        
                        // Construct an instant local preview blob URL so tablet users verify what they shot
                        const localBlobUrl = URL.createObjectURL(file);
                        
                        // Sync values cleanly straight into the matching state object row
                        setObservationsList(observationsList.map(item => 
                          item.id === obs.id ? { ...item, attachedFile: file, previewUrl: localBlobUrl } : item
                        ));
                      }}
                    />

                    {/* TOUCH TARGET DESIGN BUTTON FOR TOUCHSCREENS */}
                    <button
                      type="button"
                      onClick={() => document.getElementById(`file-capture-${obs.id}`)?.click()}
                      className="flex items-center justify-center gap-2 border border-dashed border-slate-300 bg-white hover:bg-slate-100 px-4 py-2.5 rounded-sm text-xs font-bold text-slate-700 font-mono transition-colors cursor-pointer"
                    >
                      <svg className="h-4 w-4 text-[#142E88]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {obs.attachedFile ? "Change Photo" : "Tap to Launch Camera / Attach"}
                    </button>

                    {/* REAL-TIME VISUAL COUNTERPART CARD */}
                    {obs.previewUrl ? (
                      <div className="relative h-12 w-16 border rounded bg-slate-900 overflow-hidden shrink-0 ml-auto">
                        <img src={obs.previewUrl} alt="Thumbnail Preview" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setObservationsList(observationsList.map(item => 
                            item.id === obs.id ? { ...item, attachedFile: null, previewUrl: "" } : item
                          ))}
                          className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 flex items-center justify-center text-white text-[10px] font-bold transition-opacity cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic font-medium ml-auto">No image bound to observation slot.</span>
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
    </div>
  );
}