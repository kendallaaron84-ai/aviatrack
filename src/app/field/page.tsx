// File: src/app/field/page.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plane, CloudSun, Building2, ArrowLeft, CheckCircle2, Plus, Trash2, AlertTriangle, RotateCcw } from "lucide-react";
import { Textarea } from "@/components/ui/textarea"; 
import Link from "next/link";
import { getAuth } from "firebase/auth";

// Centralized Firebase Imports + Added Storage Tools
import { db, auth } from "@/lib/firebase";
import { collection, onSnapshot, doc, updateDoc, writeBatch } from "firebase/firestore";
import { getStorage, ref as storageRef, getDownloadURL, getMetadata, uploadBytesResumable } from "firebase/storage";
import { formatItemNumber } from "@/lib/field-observation-utils";
import { deleteStagedEvidence, deleteStagedEvidenceMany, getStagedEvidence, getStagedEvidenceMany, putStagedEvidence } from "@/lib/evidence-draft-store";
import { evidenceStoragePath, evidenceSummary, isNonEmptyEvidence, sha256Hex, type EvidenceManifestEntry, type EvidenceVerificationStatus, type StagedEvidenceRecord } from "@/lib/evidence-integrity";

const STAGES = ["Construction", "Commission", "ORAT Trials", "Close-Out - Operations"];
const WEATHER_OPTIONS = ["Raining", "Dry", "Hot", "Cold"];
const OBSERVATION_TYPES = ["General", "Risk", "Safety", "Change Request"];
const PRIORITIES = ["Low", "Medium", "High"];
const MAX_UPLOAD_ATTEMPTS = 3;

type FieldObservationAllocation = {
  id: string;
  reportNumber: string;
  sequenceNumber: number;
  submittedAt: string;
};

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
  const [draftReady, setDraftReady] = useState(false);
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [pendingAllocation, setPendingAllocation] = useState<FieldObservationAllocation | null>(null);

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
    { id: crypto.randomUUID(), type: "General", priority: "Low", description: "", attachedFiles: [], previewUrls: [], evidenceIds: [] }
  ]);

  const evidenceStateSummary = useMemo(() => evidenceSummary(
    uploadProgressList.map(item => item.status as EvidenceVerificationStatus),
  ), [uploadProgressList]);

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
    } else {
      setDraftReady(true);
    }
  }, []);

  const handleRestoreDraft = async () => {
    const saved = localStorage.getItem("field_observation_full_draft");
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        if (draft.draftId) setDraftId(draft.draftId);
        if (draft.pendingAllocation) setPendingAllocation(draft.pendingAllocation);
        if (draft.program) setProgram(draft.program);
        if (draft.project) setProject(draft.project);
        if (draft.stage) setStage(draft.stage);
        if (draft.location) setLocation(draft.location);
        if (draft.isExterior !== undefined) setIsExterior(draft.isExterior);
        if (draft.weather) setWeather(draft.weather);
        if (draft.buildingLevel) setBuildingLevel(draft.buildingLevel);
        if (draft.sector) setSector(draft.sector);
        if (draft.selectedPersonnel) setSelectedPersonnel(draft.selectedPersonnel);
        if (draft.observationsList) {
          const restoredObservations = await Promise.all(draft.observationsList.map(async (observation: any) => {
            const evidenceIds = Array.isArray(observation.evidenceIds) ? observation.evidenceIds : [];
            const records = await getStagedEvidenceMany(evidenceIds);
            return {
              ...observation,
              evidenceIds: records.map(record => record.id),
              attachedFiles: records.map(record => new File([record.blob], record.originalFileName, {
                type: record.contentType,
                lastModified: record.lastModified,
              })),
              previewUrls: records.map(record => URL.createObjectURL(record.blob)),
            };
          }));
          setObservationsList(restoredObservations);
          const restoredRecords = await getStagedEvidenceMany(restoredObservations.flatMap((observation: any) => observation.evidenceIds || []));
          setUploadProgressList(restoredRecords.map(record => ({
            id: record.id,
            observationId: record.observationId,
            fileName: record.originalFileName,
            bytesTransferred: record.status === "VERIFIED" ? record.originalSizeBytes : 0,
            totalBytes: record.originalSizeBytes,
            percentage: record.status === "VERIFIED" ? 100 : 0,
            status: record.status,
            error: record.lastError || "",
          })));
        }
        
        toast({ title: "Draft Restored", description: "Your previously saved field log has been restored." });
      } catch (err) {
        console.error("Failed to restore draft:", err);
        toast({ variant: "destructive", title: "Restore Failed", description: "The draft was corrupted or incomplete." });
      }
    }
    setSavedDraftExists(false);
    setDraftReady(true);
  };

  const handleDiscardDraft = async () => {
    try {
      const saved = JSON.parse(localStorage.getItem("field_observation_full_draft") || "{}");
      const evidenceIds = Array.isArray(saved.observationsList)
        ? saved.observationsList.flatMap((observation: any) => Array.isArray(observation.evidenceIds) ? observation.evidenceIds : [])
        : [];
      await deleteStagedEvidenceMany(evidenceIds);
      observationsList.forEach(observation => observation.previewUrls?.forEach((url: string) => URL.revokeObjectURL(url)));
      localStorage.removeItem("field_observation_full_draft");
      setSavedDraftExists(false);
      setDraftReady(true);
      toast({ title: "Draft Discarded", description: "The local field log and its staged evidence have been cleared." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Draft cleanup failed", description: error.message || "The staged evidence could not be cleared safely." });
    }
  };

  // Persist metadata immediately after each change, then refresh it periodically.
  // Image bytes live in IndexedDB and are never serialized into localStorage.
  useEffect(() => {
    if (!draftReady || isSubmittedSuccessfully) return;
    const persistDraft = () => {
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
        draftId,
        pendingAllocation,
        observationsList: observationsList.map(obs => ({
          id: obs.id,
          type: obs.type,
          priority: obs.priority,
          description: obs.description,
          evidenceIds: obs.evidenceIds || [],
          evidenceMetadata: (obs.attachedFiles || []).map((file: File, index: number) => ({
            evidenceId: obs.evidenceIds?.[index] || "",
            name: file.name,
            size: file.size,
            type: file.type,
          })),
          attachedFiles: [],
          previewUrls: [],
        }))
      };

      try {
        localStorage.setItem("field_observation_full_draft", JSON.stringify(draftPayload));
      } catch (err) {
        console.error("Offline Resilience: Autosave write failure:", err);
      }
    };

    persistDraft();
    const interval = setInterval(persistDraft, 30000);
    return () => clearInterval(interval);
  }, [program, project, stage, location, isExterior, weather, buildingLevel, sector, selectedPersonnel, observationsList, isSubmittedSuccessfully, draftId, pendingAllocation, draftReady]);

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
      { id: crypto.randomUUID(), type: "General", priority: "Low", description: "", attachedFiles: [], previewUrls: [], evidenceIds: [] }
    ]);
  };

  const removeObservationItem = async (id: string) => {
    if (observationsList.length === 1) return;
    const observation = observationsList.find(item => item.id === id);
    const evidenceIds = observation?.evidenceIds || [];
    const hasUploadedEvidence = uploadProgressList.some(item => evidenceIds.includes(item.id) && ["UPLOADING", "VERIFYING", "VERIFIED"].includes(item.status));
    if (hasUploadedEvidence) {
      toast({ variant: "destructive", title: "Evidence Locked", description: "An observation cannot be removed after its evidence upload has started." });
      return;
    }
    observation?.previewUrls?.forEach((url: string) => URL.revokeObjectURL(url));
    await deleteStagedEvidenceMany(evidenceIds);
    setUploadProgressList(previous => previous.filter(item => !evidenceIds.includes(item.id)));
    setObservationsList(observationsList.filter(item => item.id !== id));
  };

  const updateObservationField = (id: string, field: string, value: string) => {
    setObservationsList(observationsList.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const updateEvidenceProgress = (id: string, patch: Record<string, unknown>) => {
    setUploadProgressList(previous => previous.map(item => item.id === id ? { ...item, ...patch } : item));
  };

  const stageEvidenceFiles = async (observationId: string, files: File[]) => {
    const rejected = files.filter(file => !isNonEmptyEvidence(file));
    const accepted = files.filter(isNonEmptyEvidence);

    if (rejected.length > 0) {
      toast({
        variant: "destructive",
        title: "Zero-byte evidence rejected",
        description: `The following file${rejected.length === 1 ? " is" : "s are"} empty and must be reselected: ${rejected.map(file => file.name || "Unnamed image").join(", ")}`,
      });
    }
    if (accepted.length === 0) return;

    try {
      const now = new Date().toISOString();
      const staged = accepted.map(file => ({
        record: {
          id: crypto.randomUUID(),
          draftId,
          observationId,
          originalFileName: file.name || `evidence-${Date.now()}.jpg`,
          originalSizeBytes: file.size,
          contentType: file.type || "image/jpeg",
          lastModified: file.lastModified || Date.now(),
          blob: file,
          status: "STAGED" as const,
          attempts: 0,
          createdAt: now,
          updatedAt: now,
        } satisfies StagedEvidenceRecord,
        file,
        previewUrl: URL.createObjectURL(file),
      }));

      await Promise.all(staged.map(item => putStagedEvidence(item.record)));
      setObservationsList(previous => previous.map(observation => observation.id === observationId ? {
        ...observation,
        attachedFiles: [...(observation.attachedFiles || []), ...staged.map(item => item.file)],
        previewUrls: [...(observation.previewUrls || []), ...staged.map(item => item.previewUrl)],
        evidenceIds: [...(observation.evidenceIds || []), ...staged.map(item => item.record.id)],
      } : observation));
      setUploadProgressList(previous => [
        ...previous,
        ...staged.map(item => ({
          id: item.record.id,
          observationId,
          fileName: item.record.originalFileName,
          bytesTransferred: 0,
          totalBytes: item.record.originalSizeBytes,
          percentage: 0,
          status: "STAGED" as EvidenceVerificationStatus,
          error: "",
          task: null,
        })),
      ]);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Evidence staging failed", description: error.message || "The original image could not be retained in browser storage." });
    }
  };

  const removeEvidenceFrame = async (observationId: string, index: number) => {
    const observation = observationsList.find(item => item.id === observationId);
    const evidenceId = observation?.evidenceIds?.[index];
    const progress = uploadProgressList.find(item => item.id === evidenceId);
    if (progress && ["UPLOADING", "VERIFYING", "VERIFIED"].includes(progress.status)) {
      toast({ variant: "destructive", title: "Evidence Locked", description: "This frame cannot be removed after its cloud upload has started." });
      return;
    }
    if (evidenceId) await deleteStagedEvidence(evidenceId);
    const previewUrl = observation?.previewUrls?.[index];
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setUploadProgressList(previous => previous.filter(item => item.id !== evidenceId));
    setObservationsList(previous => previous.map(item => item.id === observationId ? {
      ...item,
      attachedFiles: (item.attachedFiles || []).filter((_: unknown, fileIndex: number) => fileIndex !== index),
      previewUrls: (item.previewUrls || []).filter((_: unknown, previewIndex: number) => previewIndex !== index),
      evidenceIds: (item.evidenceIds || []).filter((_: unknown, evidenceIndex: number) => evidenceIndex !== index),
    } : item));
  };

  const verifyRetrievable = async (downloadUrl: string) => {
    const response = await fetch(downloadUrl, { headers: { Range: "bytes=0-0" }, cache: "no-store" });
    if (!response.ok) throw new Error(`Evidence retrieval returned HTTP ${response.status}.`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength < 1) throw new Error("Evidence retrieval returned no bytes.");
  };

  const uploadAndVerifyEvidence = async (
    sourceRecord: StagedEvidenceRecord,
    allocation: FieldObservationAllocation,
    resetAttempts = false,
  ): Promise<StagedEvidenceRecord> => {
    let record = { ...sourceRecord, attempts: resetAttempts ? 0 : sourceRecord.attempts };
    const storage = getStorage();

    if (record.status === "VERIFIED" && record.manifest) {
      try {
        const existingRef = storageRef(storage, record.manifest.storagePath);
        const metadata = await getMetadata(existingRef);
        if (Number(metadata.size) !== record.originalSizeBytes || Number(metadata.size) <= 0) throw new Error("Stored size no longer matches the staged original.");
        await verifyRetrievable(record.manifest.downloadUrl);
        updateEvidenceProgress(record.id, { status: "VERIFIED", percentage: 100, error: "" });
        return record;
      } catch (error: any) {
        record = { ...record, status: "FAILED", lastError: error.message || "Previously verified evidence could not be revalidated." };
        await putStagedEvidence(record);
      }
    }

    for (let attempt = record.attempts + 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
      const storagePath = evidenceStoragePath(allocation.id, record.observationId, record.id, record.originalFileName, attempt);
      const reference = storageRef(storage, storagePath);
      record = { ...record, status: "UPLOADING", attempts: attempt, updatedAt: new Date().toISOString(), lastError: "" };
      await putStagedEvidence(record);
      updateEvidenceProgress(record.id, { status: "UPLOADING", percentage: 0, error: "", attempt });

      try {
        const file = new File([record.blob], record.originalFileName, { type: record.contentType, lastModified: record.lastModified });
        if (!isNonEmptyEvidence(file)) throw new Error("The locally staged original is zero bytes.");
        const originalSha256 = await sha256Hex(file);
        const uploadTask = uploadBytesResumable(reference, file, {
          contentType: record.contentType,
          customMetadata: {
            evidenceId: record.id,
            originalFileName: record.originalFileName,
            originalSizeBytes: String(record.originalSizeBytes),
            originalSha256,
          },
        });
        updateEvidenceProgress(record.id, { task: uploadTask });
        await new Promise<void>((resolve, reject) => uploadTask.on(
          "state_changed",
          snapshot => updateEvidenceProgress(record.id, {
            bytesTransferred: snapshot.bytesTransferred,
            totalBytes: snapshot.totalBytes,
            percentage: snapshot.totalBytes > 0 ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100) : 0,
            status: snapshot.state === "paused" ? "STAGED" : "UPLOADING",
          }),
          reject,
          resolve,
        ));

        updateEvidenceProgress(record.id, { status: "VERIFYING", percentage: 100, task: null });
        const metadata = await getMetadata(reference);
        const storedSizeBytes = Number(metadata.size);
        if (storedSizeBytes <= 0) throw new Error("Firebase stored a zero-byte object.");
        if (storedSizeBytes !== record.originalSizeBytes) {
          throw new Error(`Stored size ${storedSizeBytes} does not match original size ${record.originalSizeBytes}.`);
        }
        const downloadUrl = await getDownloadURL(reference);
        await verifyRetrievable(downloadUrl);
        const verifiedAt = new Date().toISOString();
        const manifest: EvidenceManifestEntry = {
          evidenceId: record.id,
          storagePath,
          downloadUrl,
          originalFileName: record.originalFileName,
          originalSizeBytes: record.originalSizeBytes,
          storedSizeBytes,
          contentType: metadata.contentType || record.contentType,
          verificationStatus: "VERIFIED",
          verifiedAt,
          originalSha256,
          storageMd5Hash: metadata.md5Hash || "",
          uploadAttempts: attempt,
        };
        record = { ...record, status: "VERIFIED", attempts: attempt, manifest, updatedAt: verifiedAt, lastError: "" };
        await putStagedEvidence(record);
        updateEvidenceProgress(record.id, { status: "VERIFIED", percentage: 100, error: "", task: null });
        return record;
      } catch (error: any) {
        const lastError = error.message || "Evidence upload or verification failed.";
        record = { ...record, status: "FAILED", attempts: attempt, updatedAt: new Date().toISOString(), lastError };
        await putStagedEvidence(record);
        updateEvidenceProgress(record.id, { status: "FAILED", error: lastError, task: null });
        if (attempt < MAX_UPLOAD_ATTEMPTS) await new Promise(resolve => setTimeout(resolve, attempt * 500));
      }
    }
    throw new Error(record.lastError || "Evidence failed after three upload attempts.");
  };

  const retryEvidenceFrame = async (evidenceId: string) => {
    if (!pendingAllocation) {
      toast({ variant: "destructive", title: "Submission not allocated", description: "Select Submit All Field Logs once to allocate the report before retrying an upload." });
      return;
    }
    setIsSubmitting(true);
    try {
      const record = await getStagedEvidence(evidenceId);
      if (!record) throw new Error("The locally staged original is unavailable.");
      await uploadAndVerifyEvidence(record, pendingAllocation, true);
      toast({ title: "Evidence verified", description: `${record.originalFileName} passed Storage size and retrieval verification. Finalize the submission when all frames are verified.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Retry failed", description: error.message || "Evidence remains locally staged for another retry." });
    } finally {
      setIsSubmitting(false);
    }
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
      const submissionTimestamp = pendingAllocation?.submittedAt || new Date().toISOString();

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
        status: "Evidence Upload Pending",
        search_tags: parent_search_tags
      };

      let allocation = pendingAllocation;
      if (!allocation) {
        const idToken = await currentUser.getIdToken();
        const allocationResponse = await fetch("/api/field-observations", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body: JSON.stringify(fieldReportPayload),
        });
        const allocationResult = await allocationResponse.json();
        if (!allocationResponse.ok) throw new Error(allocationResult.error || "Unable to allocate Field Observation number.");
        allocation = { ...allocationResult, submittedAt: submissionTimestamp };
        setPendingAllocation(allocation);
        const savedDraft = JSON.parse(localStorage.getItem("field_observation_full_draft") || "{}");
        localStorage.setItem("field_observation_full_draft", JSON.stringify({ ...savedDraft, draftId, pendingAllocation: allocation }));
      }
      if (!allocation) throw new Error("Field Observation allocation was not returned by the server.");

      const evidenceIds = observationsList.flatMap(observation => observation.evidenceIds || []);
      const stagedRecords = await getStagedEvidenceMany(evidenceIds);
      if (stagedRecords.length !== evidenceIds.length) throw new Error("One or more locally staged originals are missing. Reselect the affected frames before submitting.");
      const zeroByteRecords = stagedRecords.filter(record => !isNonEmptyEvidence(record.blob) || record.originalSizeBytes <= 0);
      if (zeroByteRecords.length > 0) throw new Error(`Zero-byte evidence rejected: ${zeroByteRecords.map(record => record.originalFileName).join(", ")}`);

      const verifiedRecords: StagedEvidenceRecord[] = [];
      const failedRecords: StagedEvidenceRecord[] = [];
      for (const record of stagedRecords) {
        if (record.status === "FAILED" && record.attempts >= MAX_UPLOAD_ATTEMPTS) {
          failedRecords.push(record);
          continue;
        }
        try {
          verifiedRecords.push(await uploadAndVerifyEvidence(record, allocation));
        } catch {
          failedRecords.push((await getStagedEvidence(record.id)) || record);
        }
      }

      if (failedRecords.length > 0) {
        await updateDoc(doc(db, "field_observations", allocation.id), {
          status: "Evidence Upload Incomplete",
          evidenceIntegrity: {
            total: stagedRecords.length,
            verified: verifiedRecords.length,
            failed: failedRecords.length,
            updatedAt: new Date().toISOString(),
          },
        });
        toast({
          variant: "destructive",
          title: "Evidence Upload Incomplete",
          description: `${verifiedRecords.length}/${stagedRecords.length} verified. ${failedRecords.length} frame${failedRecords.length === 1 ? " requires" : "s require"} attention. Originals remain staged locally.`,
        });
        return;
      }

      const recordsByObservation = new Map<string, StagedEvidenceRecord[]>();
      verifiedRecords.forEach(record => recordsByObservation.set(record.observationId, [...(recordsByObservation.get(record.observationId) || []), record]));
      const batch = writeBatch(db);
      for (const [observationIndex, obs] of observationsList.entries()) {
        const manifests = (recordsByObservation.get(obs.id) || []).map(record => record.manifest).filter((manifest): manifest is EvidenceManifestEntry => Boolean(manifest));
        const cloudImageUrls = manifests.map(manifest => manifest.downloadUrl);

        // [ENHANCEMENT 4] Normalization search tags for the sub-observation
        const subTextPool = [
          obs.type || "",
          obs.priority || "",
          obs.description || ""
        ].join(" ").toLowerCase();
        const sub_search_tags = Array.from(new Set(subTextPool.split(/[\s,.;:!?()"/#&\-_]+/).filter(w => w.length > 1)));

        batch.set(doc(db, "field_observations", allocation.id, "sub_observations", obs.id), {
          observationId: obs.id,
          observationType: obs.type,
          priority: obs.priority,
          description: obs.description,
          createdAt: submissionTimestamp,
          itemPhotos: cloudImageUrls,
          evidenceManifest: manifests,
          evidenceVerificationStatus: "VERIFIED",
          evidenceVerifiedCount: manifests.length,
          evidenceExpectedCount: obs.evidenceIds?.length || 0,
          search_tags: sub_search_tags,
          itemNumber: formatItemNumber(allocation.sequenceNumber, observationIndex + 1),
          itemSequence: observationIndex + 1,
          reportNumber: allocation.reportNumber,
          reportSequence: allocation.sequenceNumber,
          parentObservationId: allocation.id,
        });
      }
      batch.update(doc(db, "field_observations", allocation.id), {
        status: "Needs Verification",
        evidenceIntegrity: {
          total: stagedRecords.length,
          verified: stagedRecords.length,
          failed: 0,
          verificationStatus: "VERIFIED",
          verifiedAt: new Date().toISOString(),
        },
      });
      await batch.commit();
      await deleteStagedEvidenceMany(evidenceIds);
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
    setObservationsList([{ id: crypto.randomUUID(), type: "General", priority: "Low", description: "", attachedFiles: [], previewUrls: [], evidenceIds: [] }]);
    setUploadProgressList([]);
    setPendingAllocation(null);
    setDraftId(crypto.randomUUID());
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
                        onChange={async (e) => {
                          const chosenFiles = e.target.files ? Array.from(e.target.files) : [];
                          e.currentTarget.value = "";
                          if (chosenFiles.length === 0) return;
                          await stageEvidenceFiles(obs.id, chosenFiles);
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
                        {obs.previewUrls.map((url: string, idx: number) => {
                          const evidenceId = obs.evidenceIds?.[idx];
                          const progress = uploadProgressList.find(item => item.id === evidenceId);
                          return (
                            <div key={evidenceId || idx} className={`relative h-14 w-20 border rounded bg-slate-900 overflow-hidden shrink-0 group ${progress?.status === "FAILED" ? "border-red-500 ring-1 ring-red-500" : ""}`}>
                              <img src={url} alt={`Preview ${idx + 1}`} className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => void removeEvidenceFrame(obs.id, idx)}
                                className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[9px] font-bold transition-opacity cursor-pointer"
                              >
                                Remove
                              </button>
                              <span className={`absolute bottom-0 left-0 right-0 px-1 py-0.5 text-center text-[7px] font-bold uppercase text-white ${progress?.status === "VERIFIED" ? "bg-emerald-600/90" : progress?.status === "FAILED" ? "bg-red-600/90" : "bg-slate-900/80"}`}>
                                {progress?.status || "STAGED"}
                              </span>
                            </div>
                          );
                        })}
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

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t">
          {evidenceStateSummary.total > 0 ? (
            <div className={`flex items-center gap-2 text-xs font-bold ${evidenceStateSummary.complete ? "text-emerald-700" : evidenceStateSummary.failed > 0 ? "text-red-700" : "text-amber-700"}`}>
              {evidenceStateSummary.complete ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {evidenceStateSummary.complete
                ? `Evidence: ${evidenceStateSummary.verified}/${evidenceStateSummary.total} Verified`
                : evidenceStateSummary.failed > 0
                  ? `Evidence Upload Incomplete: ${evidenceStateSummary.verified}/${evidenceStateSummary.total} Verified — ${evidenceStateSummary.failed} require attention`
                  : `Evidence staged locally: ${evidenceStateSummary.verified}/${evidenceStateSummary.total} Verified`}
            </div>
          ) : <span className="text-xs text-slate-500">No evidence frames attached.</span>}
          <Button type="submit" disabled={isSubmitting} className="bg-[#142E88] hover:bg-[#1f3ab3] text-white font-bold rounded-sm h-11 px-8 text-sm shadow-sm cursor-pointer">
            {isSubmitting ? "Uploading and Verifying Evidence..." : evidenceStateSummary.total > 0 && evidenceStateSummary.complete ? "Finalize Verified Field Logs" : "Submit All Field Logs"}
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
              {isSubmitting ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent" /> : <CheckCircle2 className="h-4 w-4 text-slate-400" />}
              <h3 className="text-xs font-bold uppercase tracking-wider">Evidence Integrity</h3>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              {evidenceStateSummary.verified} / {evidenceStateSummary.total} Verified
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
                    {item.status === "FAILED" && (
                      <button
                        type="button"
                        onClick={() => void retryEvidenceFrame(item.id)}
                        disabled={isSubmitting}
                        className="text-[9px] bg-red-600 hover:bg-red-500 disabled:opacity-50 px-1.5 py-0.5 rounded cursor-pointer text-white flex items-center gap-1"
                      >
                        <RotateCcw className="h-2.5 w-2.5" /> Retry
                      </button>
                    )}
                    {item.status === "VERIFIED" && (
                      <span className="text-[9px] text-emerald-400 font-bold uppercase">Verified</span>
                    )}
                    {item.status === "VERIFYING" && (
                      <span className="text-[9px] text-blue-300 font-bold uppercase">Verifying</span>
                    )}
                    {item.status === "STAGED" && (
                      <span className="text-[9px] text-amber-300 font-bold uppercase">Staged Locally</span>
                    )}
                  </div>
                </div>
                
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ${
                      item.status === "VERIFIED" ? "bg-emerald-500" :
                      item.status === "FAILED" ? "bg-rose-500" :
                      item.status === "STAGED" ? "bg-amber-500" :
                      "bg-blue-500 animate-pulse"
                    }`}
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
                {item.error && <p className="text-[9px] leading-tight text-rose-300">{item.error}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
