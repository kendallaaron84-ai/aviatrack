// File: src/app/dashboard/drawings/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { auth, db } from "@/lib/firebase"; 
import { collection, onSnapshot, doc, setDoc, getDocs } from "firebase/firestore";
import { Folder, FileText, UploadCloud, Eye, ShieldAlert, Library, Layers, Maximize2, Minimize2, X } from "lucide-react";
import { getPermissions } from "@/lib/security"; 

export default function AviationBlueprintVault() {
  const authInstance = auth; 
  const [activeTab, setActiveTab] = useState<"TDP" | "CIP">("TDP");
  const [documents, setDocuments] = useState<any[]>([]);
  const [searchFilter, setSearchFilter] = useState("");
  const [selectedDrawingUrl, setSelectedDrawingUrl] = useState<string | null>(null);
  const [associatedFiles, setAssociatedFiles] = useState<any[]>([]); 
  
  // Custom Staging States for the Upload Package Modal
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [masterPackageIdInput, setMasterPackageIdInput] = useState("");

  const [isFullscreen, setIsFullscreen] = useState(false);

  // 🟢 SECURITY CLEARANCE LOCK DOWN
  const userPerms = getPermissions(authInstance.currentUser?.email); 
  const isFieldStaffRestricted = [
    "FIELD_ENGINEER", 
    "IT_PHYSICAL_SECURITY", 
    "NETWORK_ENGINEER"
  ].includes(userPerms.role); 

  // If a restricted account navigates here, halt rendering immediately
  if (isFieldStaffRestricted) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6 bg-slate-50">
        <Card className="max-w-md w-full border-red-200 bg-red-50/50 rounded-sm text-center p-6 shadow-none">
          <ShieldAlert className="h-10 w-10 text-red-600 mx-auto mb-3" />
          <h2 className="text-xs font-bold text-red-900 uppercase tracking-wider font-mono">Access Clearance Revoked</h2>
          <p className="text-xs text-red-700 mt-2 leading-relaxed">
            Your field monitoring profile does not hold operational clearance to access the airport design package matrices. Blueprint auditing rights are deferred to project managers.
          </p>
        </Card>
      </div>
    );
  } 

  // Live Stream Master Document Manifest
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "project_documentation"), (snapshot) => {
      setDocuments(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []); 

  // Filter documents by Program Track, Latest Status, and User Search Input
  const filteredDocs = documents.filter(doc => {
    const matchesTrack = doc.programTrack === activeTab;
    const matchesSearch = 
      doc.referenceNumber?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      doc.title?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      doc.systemTagsDetected?.some((t: string) => t.toLowerCase().includes(searchFilter.toLowerCase()));
    return matchesTrack && matchesSearch;
  }); 

  // 1. Intercept selected files and open our custom design modal
  const handleFileSelectionIntercept = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setPendingFiles(Array.from(files));
    setMasterPackageIdInput(""); 
    setIsUploadModalOpen(true);   
  };

  // 2. Execute the database transaction using our custom modal input value
  const handleExecutePackageCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!masterPackageIdInput.trim() || pendingFiles.length === 0) return;

    const targetPackageId = masterPackageIdInput.trim().toUpperCase();
    const timestamp = new Date().toISOString();

    try {
      // 🟢 HYDRATE SOURCE VIEWPORT TARGETS: Generate direct high-resolution render keys from the files array
      const initialMasterUrl = pendingFiles[0] ? URL.createObjectURL(pendingFiles[0]) : "";

      // Initialize or Update the Master Parent Document Envelope
      const parentDocRef = doc(db, "project_documentation", targetPackageId);
      await setDoc(parentDocRef, {
        docId: targetPackageId,
        referenceNumber: targetPackageId, 
        title: `Package Bundle: ${targetPackageId}`,
        programTrack: activeTab, 
        uploadedAt: timestamp,
        type: "Bulletin", 
        fileUrl: initialMasterUrl, // Stores fluid local object access URL for primary viewer rendering
        isLatest: true 
      }, { merge: true });

      // Loop and Inject each uploaded asset as an independent child record
      for (let i = 0; i < pendingFiles.length; i++) {
        const file = pendingFiles[i];
        const sanitizedFileId = file.name.replace(/\.[^/.]+$/, "").toUpperCase();
        
        // 🟢 RUN FLUID BLOB REGISTRY HYDRATION
        const functionalBlobUrl = URL.createObjectURL(file);
        
        const childDocRef = doc(db, "project_documentation", targetPackageId, "package_files", sanitizedFileId);
        
        await setDoc(childDocRef, {
          fileName: file.name,
          documentType: file.name.toLowerCase().includes("drawing") ? "Drawing" : "Specification/Narrative",
          uploadedAt: timestamp,
          fileUrl: functionalBlobUrl // Restores direct functional package file visibility
        });
      }

      setIsUploadModalOpen(false);
      setPendingFiles([]);
      setMasterPackageIdInput("");
      
      alert(`Package Successfully Synchronized: Attached ${pendingFiles.length} files to ${targetPackageId}`);
    } catch (err: any) {
      console.error("Failed to commit package bundle entries:", err);
    }
  };

  return (
    <div className="max-w-[1700px] mx-auto space-y-6 pb-12">
      {/* HEADER BAR */}
      <div className="flex items-center justify-between border-b pb-4 bg-white">
        <div className="flex items-center gap-2">
          <Library className="h-5 w-5 text-[#142E88]" />
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Aviation Blueprint & Bulletin Engine</h1>
            <p className="text-xs text-slate-500">Cross-reference architectural sheets, view version baselines, and isolate infrastructure dependencies.</p>
          </div>
        </div>

        {/* PROGRAM ISOLATION FLIPPER */}
        <div className="flex bg-slate-100 p-1 rounded border text-xs font-semibold">
          <button onClick={() => { setActiveTab("TDP"); setSelectedDrawingUrl(null); setAssociatedFiles([]); }} className={`px-4 py-2 rounded-sm transition-all flex items-center gap-2 ${activeTab === "TDP" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-200 cursor-pointer"}`}><Folder className="h-3.5 w-3.5" /> TDP Track Files</button>
          <button onClick={() => { setActiveTab("CIP"); setSelectedDrawingUrl(null); setAssociatedFiles([]); }} className={`px-4 py-2 rounded-sm transition-all flex items-center gap-2 ${activeTab === "CIP" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-200 cursor-pointer"}`}><Folder className="h-3.5 w-3.5" /> CIP Track Files</button>
        </div>
      </div>

      {/* CORE CONTROL SHEET PANELS */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        
        {/* LEFT COLUMN: FOLDER DIRECTORY LEDGER (2 COLS WIDE) */}
        <Card className="border-slate-200 shadow-sm rounded-sm xl:col-span-2 bg-white">
          <CardHeader className="bg-slate-50 border-b py-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xs font-bold text-slate-700 uppercase tracking-wider">{activeTab} Program Master Catalog</CardTitle>
              <CardDescription className="text-[10px] text-slate-400">Preserving immutable audit trails from base configuration up through bulletin adjustments.</CardDescription>
            </div>
            
            <label className="bg-[#142E88] hover:bg-[#201cb0] text-white text-xs font-bold px-3 py-1.5 rounded-sm flex items-center gap-1.5 cursor-pointer shadow-xs">
              <UploadCloud className="h-3.5 w-3.5" /> Stage {activeTab} Drawings/Bulletins
              <input type="file" multiple className="hidden" onChange={handleFileSelectionIntercept} accept=".pdf,.dwg,.png,.jpg" /> 
            </label>
          </CardHeader>
          
          <CardContent className="p-0">
            <div className="p-3 border-b bg-slate-50/30">
              <Input
                placeholder={`Search ${activeTab} reference sheets, spec lines, or active watch-list tags...`}
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                className="h-9 text-xs bg-white"
              />
            </div>

            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead className="text-[10px] font-bold uppercase py-2 pl-4">Sheet / Document ID</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-2">Document Title</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-2">IT IMPACTS</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-2">Lifecycle Status</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-2 text-right pr-4">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocs.map(doc => (
                  <TableRow key={doc.id} className="hover:bg-slate-50/40">
                    <TableCell className="font-mono text-xs font-bold text-[#142E88] py-3 pl-4">{doc.referenceNumber || doc.docId}</TableCell>
                    <TableCell>
                      <div className="text-xs font-semibold text-slate-900 leading-tight flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-slate-400" /> {doc.title}</div>
                      <div className="text-[9px] font-mono text-slate-400 mt-0.5">Ingested: {doc.uploadedAt?.split('T')[0]}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {doc.systemTagsDetected?.map((tag: string) => (
                          <Badge key={tag} className="text-[9px] font-mono px-1 bg-amber-50 text-amber-800 shadow-none border border-amber-200/60 rounded-xs">{tag}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {doc.isLatest ? (
                        <Badge className="bg-emerald-50 text-emerald-700 font-bold text-[10px] rounded-xs shadow-none border border-emerald-200">Active Revision</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-slate-400 text-[10px] rounded-xs shadow-none">Superseded History</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right pr-4">
                      <Button 
                        onClick={async () => {
                          setSelectedDrawingUrl(doc.fileUrl || "");
                          setAssociatedFiles([]); 
                          
                          try {
                            const querySnapshot = await getDocs(
                              collection(db, "project_documentation", doc.id, "package_files")
                            );
                            const childFiles = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                            setAssociatedFiles(childFiles);
                          } catch (err) {
                            console.error("Failed to load package bundle elements:", err);
                          }
                        }} 
                        variant="ghost" 
                        className="h-7 text-xs font-bold text-[#142E88] hover:bg-slate-100 px-2 rounded-xs flex items-center gap-1 ml-auto"
                      >
                        <Eye className="h-3.5 w-3.5" /> Project Viewer
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredDocs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-xs text-slate-400 italic font-medium">No drawings mapped under this program partition.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* RIGHT COLUMN: HIGH-RES RENDER VIEW WINDOW */}
        <Card className={`border-slate-200 shadow-sm rounded-sm bg-white ${
          isFullscreen 
            ? "fixed inset-0 z-50 m-0 w-screen h-screen rounded-none p-6 space-y-4 overflow-y-auto" 
            : "sticky top-6"
        }`}>
          
          <CardHeader className="bg-slate-50 border-b py-3 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-[#142E88]" /> Core Engine Viewport
            </CardTitle>
            {selectedDrawingUrl && (
              <Button 
                onClick={() => setIsFullscreen(!isFullscreen)} 
                variant="outline" 
                className="h-7 text-[11px] font-bold border-slate-200 hover:bg-slate-100 px-2 rounded-xs flex items-center gap-1.5"
              >
                {isFullscreen ? <>Exit Fullscreen</> : <>Fullscreen Mode</>}
              </Button>
            )}
          </CardHeader>
          
          <CardContent className={isFullscreen ? "h-[calc(100vh-140px)] flex flex-col gap-4" : "p-4"}>
            {selectedDrawingUrl ? (
              <div className={`space-y-4 ${isFullscreen ? "flex-1 flex flex-col space-y-0 gap-4" : ""}`}>
                
                <div className={`w-full border bg-slate-900 rounded-sm flex items-center justify-center relative overflow-hidden group ${
                  isFullscreen ? "flex-1 h-full" : "h-[500px]"
                }`}>
                  <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-20 pointer-events-none" />
                  
                  {/* 🟢 DYNAMIC VIEWER SELECTION DISPATCHER */}
                  {selectedDrawingUrl.startsWith("blob:") || selectedDrawingUrl.toLowerCase().includes(".pdf") ? (
                    <object
                      data={selectedDrawingUrl}
                      type="application/pdf"
                      className="w-full h-full bg-slate-800"
                    >
                      <iframe 
                        src={selectedDrawingUrl} 
                        className="w-full h-full border-none bg-slate-800"
                        title="Technical Document Viewer Frame"
                      />
                    </object>
                  ) : (
                    <img 
                      src={selectedDrawingUrl} 
                      alt="Engineering Drawing Spec Sheet Layout"
                      className="w-full h-full object-contain opacity-95 group-hover:scale-102 transition-transform duration-300"
                    />
                  )}

                  <div className="absolute bottom-3 right-3 bg-slate-950/80 px-2 py-1 text-[10px] font-mono font-bold text-emerald-400 border border-emerald-500/20 rounded-xs pointer-events-none z-10">
                    SCALE: {isFullscreen ? "ZOOM OPTIMIZED" : "N.T.S"}
                  </div>
                </div>

                {/* UPDATED IT DEPENDENCY SUMMARY FEED */}
                <div className="p-3 bg-blue-50/50 border border-blue-200/50 rounded-sm flex items-start gap-2.5 text-xs shrink-0">
                  <ShieldAlert className="h-4 w-4 text-[#142E88] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-[#142E88] uppercase text-[10px] tracking-wide">IT Impact Trace Active</h4>
                    <p className="text-slate-600 mt-0.5 leading-relaxed">Watchlist scan verified active IT infrastructure dependencies or linked change orders within this document framework.</p>
                  </div>
                </div>

                {/* ATTACHMENT LIST PLACEMENT */}
                {associatedFiles.length > 0 && (
                  <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-sm space-y-2 shrink-0">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono block">
                      Package Bundle Attachments ({associatedFiles.length})
                    </span>
                    <div className="flex flex-col gap-1.5">
                      {associatedFiles.map((file) => (
                        <button
                          key={file.id}
                          type="button"
                          onClick={() => setSelectedDrawingUrl(file.fileUrl)}
                          className={`text-left p-2 text-xs font-medium rounded-xs border transition-all cursor-pointer ${
                            selectedDrawingUrl === file.fileUrl
                              ? "bg-[#142E88] border-[#142E88] text-white font-bold"
                              : "bg-white text-slate-700 hover:bg-slate-100 border-slate-200"
                          }`}
                        >
                          📄 {file.fileName}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            ) : (
              <div className="h-[500px] flex flex-col items-center justify-center text-center border-2 border-dashed border-slate-100 rounded-sm bg-slate-50/30">
                <FileText className="h-10 w-10 text-slate-200 mb-2" />
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Select a sheet to initialize viewport</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* CUSTOM REFINE WINDOW MODAL INLINE DESIGN OVERLAY */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 shadow-2xl rounded-sm w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="bg-[#142E88] text-white px-4 py-3 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                <UploadCloud className="h-4 w-4 text-[#1EA7F4]" /> Document Indexing Wizard
              </h3>
              <button 
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="text-slate-300 hover:text-white p-1 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleExecutePackageCommit} className="p-5 space-y-4 text-xs font-medium">
              <div className="bg-slate-50 p-3 border border-slate-200 text-slate-500 font-mono text-[11px] rounded-xs space-y-1">
                <span className="font-bold text-slate-700 block uppercase text-[9px] tracking-wider">Staged Document Queue ({pendingFiles.length}):</span>
                <div className="max-h-20 overflow-y-auto divide-y divide-slate-200/60">
                  {pendingFiles.map((f, index) => (
                    <div key={index} className="py-1 truncate">📄 {f.name}</div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-700 font-bold block uppercase tracking-wide text-[10px]">
                  Master Package Configuration ID
                </label>
                <Input 
                  required
                  value={masterPackageIdInput}
                  onChange={e => setMasterPackageIdInput(e.target.value)}
                  placeholder="e.g., BULLETIN-048, CHANGE-ORDER-22" 
                  className="bg-white rounded-none border-slate-300 shadow-none font-mono text-xs uppercase h-9 focus-visible:ring-1 focus-visible:ring-[#142E88]" 
                />
                <p className="text-[10px] text-slate-400 font-sans leading-snug">
                  Entering the package designation ID creates a unified parent record envelope and binds all staged items to this singular catalog path.
                </p>
              </div>

              {/* Action Rows Buttons */}
              <div className="flex gap-3 pt-2 border-t mt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsUploadModalOpen(false)}
                  className="flex-1 rounded-none border-slate-200 text-slate-500 h-9 font-bold text-xs cursor-pointer hover:bg-slate-50"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="flex-1 bg-[#142E88] hover:bg-[#1f3bb0] text-white rounded-none h-9 font-bold text-xs cursor-pointer"
                >
                  Confirm & Commit Package
                </Button>
              </div>
            </form>

          </div>
        </div>
      )}
    </div>
  );
}