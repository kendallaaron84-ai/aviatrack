// File: src/app/dashboard/review/[id]/page.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Paperclip, MessageSquare, Send, ShieldAlert, Image as ImageIcon, FileText, X, Printer, ArrowLeft, ClipboardList, Maximize2, ZoomIn, ZoomOut, HardHat, Calendar, CloudSun } from "lucide-react";
import { db, auth } from "@/lib/firebase";

// Native Firebase Transactions
import { doc, getDoc, updateDoc, collection, addDoc, onSnapshot, query, where, getDocs } from "firebase/firestore";
import { getStorage, ref as storageRef, getDownloadURL, uploadBytesResumable } from "firebase/storage";

const getSubObsPhotos = (item: any): string[] => {
  if (!item) return [];
  if (Array.isArray(item.itemPhotos) && item.itemPhotos.length > 0) return item.itemPhotos;
  if (Array.isArray(item.photos) && item.photos.length > 0) return item.photos;
  if (Array.isArray(item.photoUrls) && item.photoUrls.length > 0) return item.photoUrls;
  if (Array.isArray(item.attachments) && item.attachments.length > 0) return item.attachments;
  if (typeof item.itemPhoto === 'string' && item.itemPhoto.trim()) return [item.itemPhoto];
  if (typeof item.imageUrl === 'string' && item.imageUrl.trim()) return [item.imageUrl];
  if (typeof item.photoUrl === 'string' && item.photoUrl.trim()) return [item.photoUrl];
  return [];
};

const getDocUrl = (att: any): string => {
  if (typeof att === 'string') return att;
  return att?.previewUrl || att?.url || att?.fileUrl || att?.downloadUrl || '';
};

const getDocName = (att: any, index: number): string => {
  if (typeof att === 'object' && att?.name) return att.name;
  const url = getDocUrl(att);
  if (url) {
    try {
      const cleanPath = decodeURIComponent(url.split('?')[0]);
      const filename = cleanPath.split('/').pop();
      if (filename && filename.includes('.')) return filename;
    } catch (e) {}
  }
  return `Resolution_Doc_${index + 1}`;
};

const getFileType = (url: string, name: string): 'pdf' | 'heic' | 'image' => {
  if (!url) return 'image';
  
  const cleanUrl = url.split('?')[0].toLowerCase();
  const cleanName = (name || '').toLowerCase();

  if (cleanUrl.endsWith('.pdf') || cleanName.endsWith('.pdf')) return 'pdf';
  if (cleanUrl.endsWith('.heic') || cleanName.endsWith('.heic') || cleanUrl.endsWith('.heif')) return 'heic';
  
  // Default to image for standard photos, jpeg, png, webp, and blob previews
  return 'image';
};

const ImageAttachmentCard = ({ url, name, openImageModal }: { url: string; name: string; openImageModal: (url: string) => void }) => {
  const [hasError, setHasError] = useState(false);

  if (hasError || !url) {
    return (
      <div 
        onClick={() => url && window.open(url, '_blank')}
        className="relative p-2 border rounded-sm bg-slate-50 flex items-center gap-2 text-xs cursor-pointer hover:border-slate-400 transition-colors print:bg-white print:border-none print:p-1"
      >
        <FileText className="h-6 w-6 text-slate-500 shrink-0 print:text-black" />
        <span className="truncate font-medium text-slate-700 font-mono text-[11px] print:text-slate-900" title={name}>
          {name}
        </span>
      </div>
    );
  }

  return (
    <div 
      onClick={() => openImageModal(url)}
      className="relative p-2 border rounded-sm bg-slate-50 flex items-center gap-2 text-xs cursor-pointer hover:border-[#3c38d4] transition-colors group print:bg-white print:border-none print:p-1"
    >
      <img 
        src={url} 
        alt={name} 
        className="h-8 w-8 object-cover rounded-xs shrink-0" 
        onError={() => setHasError(true)}
      />
      <span className="truncate font-medium text-slate-700 font-mono text-[11px] group-hover:text-[#3c38d4] print:text-slate-900" title={name}>
        {name}
      </span>
    </div>
  );
};

const CloseoutCard = ({ 
  att, 
  idx, 
  isReadOnly, 
  subObservationsList, 
  updateAttachmentMeta, 
  openImageModal 
}: { 
  att: any; 
  idx: number; 
  isReadOnly: boolean; 
  subObservationsList: any[]; 
  updateAttachmentMeta: (attId: string, field: string, value: string) => void; 
  openImageModal: (url: string) => void; 
}) => {
  const [imgError, setImgError] = useState(false);
  const url = getDocUrl(att);
  const name = getDocName(att, idx);

  // Extract selected Log Entry label for static PDF export
  const getSelectedLabel = () => {
    if (!att.logEntryRef) return 'None Selected';
    if (att.logEntryRef === 'General Resolution') return 'General Resolution';
    
    // Parse index from e.g. "Log Entry #1"
    const match = att.logEntryRef.match(/Log Entry #(\d+)/);
    if (match) {
      const idxVal = parseInt(match[1], 10) - 1;
      const sub = subObservationsList[idxVal];
      if (sub) {
        return `Log Entry #${idxVal + 1} (${sub.observationType || 'General'})`;
      }
    }
    return att.logEntryRef;
  };
  const selectedLabel = getSelectedLabel();

  if (url && url.startsWith('blob:')) {
    return (
      <div className="border border-red-200 rounded-sm bg-red-50/50 p-3 flex items-center gap-2 text-xs print:hidden">
        <ShieldAlert className="h-6 w-6 text-red-500 shrink-0" />
        <div className="flex flex-col min-w-0 flex-1">
          <span className="truncate font-medium text-slate-700 font-mono text-[11px]" title={name}>
            {name}
          </span>
          <span className="text-[10px] text-red-600 font-bold">Attachment Expired (Re-upload Required)</span>
        </div>
      </div>
    );
  }

  const type = getFileType(url, name);

  return (
    <div className="observation-card">
      {/* 1. Static Embedded Image Container (NO links, NO external URLs) */}
      <div className="thumbnail-wrapper">
        {url ? (
          (() => {
            if (type === 'pdf') {
              return (
                <div className="flex flex-col items-center justify-center w-full h-full p-2">
                  <FileText className="h-12 w-12 text-red-500 print:text-black" />
                  <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider font-mono mt-1 text-center truncate w-full">{name}</span>
                </div>
              );
            }
            
            if (type === 'heic') {
              return (
                <div className="flex flex-col items-center justify-center w-full h-full p-2">
                  <ImageIcon className="h-12 w-12 text-blue-500 print:text-black" />
                  <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider font-mono mt-1 text-center truncate w-full">{name}</span>
                </div>
              );
            }

            if (imgError) {
              return (
                <div className="flex flex-col items-center justify-center w-full h-full p-2">
                  <FileText className="h-12 w-12 text-slate-400 print:text-black" />
                  <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider font-mono mt-1 text-center truncate w-full">{name}</span>
                </div>
              );
            }
            
            return (
              <img 
                src={url} 
                alt="Field Observation Evidence" 
                onError={() => setImgError(true)}
              />
            );
          })()
        ) : (
          <div className="no-image-placeholder">No Document Attached</div>
        )}
      </div>

      {/* 2. Metadata Content Column */}
      <div className="details-content">
        
        {/* LOG ENTRY REFERENCE */}
        <div className="detail-item">
          <span className="label">LOG ENTRY REFERENCE:</span>
          
          {/* Web Interactive Dropdown (Screen Only) */}
          {!isReadOnly && (
            <select
              value={att.logEntryRef || ''}
              onChange={(e) => updateAttachmentMeta(att.id, 'logEntryRef', e.target.value)}
              className="print:hidden form-select max-w-xs"
            >
              <option value="">Select Log Entry...</option>
              {subObservationsList.map((sub, sIdx) => (
                <option key={sub.id || sIdx} value={`Log Entry #${sIdx + 1}`}>
                  Log Entry #{sIdx + 1} ({sub.observationType || 'General'})
                </option>
              ))}
              <option value="General Resolution">General Resolution</option>
            </select>
          )}

          {/* Static Text String for PDF Export & Read-Only Mode */}
          <span className={`${!isReadOnly ? 'hidden print:inline-block' : 'inline-block'} font-medium text-slate-800`}>
            {selectedLabel}
          </span>
        </div>

        {/* SOURCE REFERENCE */}
        <div className="detail-item">
          <span className="label">SOURCE REFERENCE:</span>
          
          {!isReadOnly ? (
            <div className="flex flex-col gap-1 print:hidden max-w-md">
              <input
                type="text"
                value={att.source || ''}
                onChange={(e) => updateAttachmentMeta(att.id, 'source', e.target.value)}
                className="form-input"
                placeholder="Reference Title (e.g., Bulletin, Conformed Set)"
              />
              <input
                type="text"
                value={att.sourceUrl || ''}
                onChange={(e) => updateAttachmentMeta(att.id, 'sourceUrl', e.target.value)}
                className="form-input text-xs text-blue-600"
                placeholder="SharePoint / Document URL"
              />
            </div>
          ) : null}

          {/* Formatted SharePoint Link for PDF / Print Output */}
          <div className={`${!isReadOnly ? 'hidden print:flex' : 'flex'} flex-col gap-0.5`}>
            <span className="font-semibold text-slate-800">
              {att.source || 'N/A'}
            </span>
            {att.sourceUrl && (
              <a 
                href={att.sourceUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="source-document-link text-blue-600 underline text-xs break-all"
              >
                {att.sourceUrl}
              </a>
            )}
          </div>
        </div>

        {/* PM CONVERSATION NOTES */}
        <div className="detail-item">
          <span className="label">PM CONVERSATION NOTES:</span>
          {!isReadOnly ? (
            <textarea
              value={att.notes || ''}
              onChange={(e) => updateAttachmentMeta(att.id, 'notes', e.target.value)}
              className="print:hidden form-textarea max-w-xl"
              rows={2}
            />
          ) : null}
          <p className={`${!isReadOnly ? 'hidden print:block' : 'block'} text-slate-700 whitespace-pre-wrap m-0`}>
            {att.notes || 'No notes provided.'}
          </p>
        </div>

      </div>
    </div>
  );
};

export default function ReviewObservationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const router = useRouter();
  const { toast } = useToast();

  // 👥 REAL ENTERPRISE TEAM DIRECTORY PIPED FROM SECURITY REGISTRY
  const PROJECT_TEAM = [
    { name: "Kendall Aaron", email: "kendallaaron84@gmail.com", handle: "kendall", role: "Program Manager" },
    { name: "Kassaundra Salinas", email: "kassaundra.salinas@sanantonio.gov", handle: "kassie", role: "Project Manager" },
    { name: "Lejandro Ligeralde", email: "lejandro.ligeralde@sanantonio.gov", handle: "lejandro", role: "Project Manager" },
    { name: "Ytevia Watts", email: "ytevia.watts@sanantonio.gov", handle: "ytevia", role: "Portfolio Manager" },
    { name: "John Perez", email: "john.perez2@sanantonio.gov", handle: "john", role: "IT Physical Security Specialist" },
    { name: "Ricardo Briseno", email: "ricardo.briseno@sanantonio.gov", handle: "ricardo", role: "Network Engineer" },
    { name: "Andrew Jaffee", email: "andrew.jafee@sanantonio.gov", handle: "andrew", role: "Sr. IT Network Manager" }
  ];

  // 📡 INDEPENDENT STATES FOR CHAT MENTION SUGGESTIONS ENGINE
  const [showDropdown, setShowDropdown] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter team elements matching character inputs dynamically
  const filteredTeam = useMemo(() => {
    if (!mentionSearch) return PROJECT_TEAM;
    return PROJECT_TEAM.filter(user => 
      user.name.toLowerCase().includes(mentionSearch.toLowerCase()) ||
      user.handle.toLowerCase().includes(mentionSearch.toLowerCase())
    );
  }, [mentionSearch]);
    
  // Master Core States
  const [obs, setObs] = useState<any>(null);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [resolutionType, setResolutionType] = useState("");
  const [status, setStatus] = useState("");
  const [comment, setComment] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Sub-Observations List with Nested Photos
  const [subObservationsList, setSubObservationsList] = useState<any[]>([]);
  const [pmAttachments, setPmAttachments] = useState<any[]>([]);
  const [pmCommentsHistory, setPmCommentsHistory] = useState<any[]>([]);

  // Security & Portfolio Oversight 
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [portfolioQuestion, setPortfolioQuestion] = useState("");
  const [portfolioQuestionsFeed, setPortfolioQuestionsFeed] = useState<any[]>([]);

  // Coupled Integration Mapping States (Scurbbed ProjectSight references completely)
  const [dailyReportRecordNumber, setDailyReportRecordNumber] = useState("");
  const [dailyReportWorkStatus, setDailyReportWorkStatus] = useState("");
  const [issuesRecordNumber, setIssuesRecordNumber] = useState("");
  const [issuesTitle, setIssuesTitle] = useState("");
  const [issuesReportNumber, setIssuesReportNumber] = useState("");

  // Interactive Lightbox Engine States
  const [activeLightboxImg, setActiveLightboxImg] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState(1);

  const updateAttachmentMeta = (attId: string, field: string, value: string) => {
    setPmAttachments(prev => prev.map(a => a.id === attId ? { ...a, [field]: value } : a));
  };

  useEffect(() => {
    const currentUserEmail = auth.currentUser?.email || "";
    if (currentUserEmail.toLowerCase().includes("ytevia") || currentUserEmail.toLowerCase().includes("portfolio")) {
      setIsReadOnly(true); 
    }

    const docRef = doc(db, "field_observations", id);
    
    getDoc(docRef).then((docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setObs(data);
        setLocation(data.location || "");
        setDescription(data.description || "");
        setResolutionType(data.resolutionType || "General");
        
        const baseStatus = data.status || "New";
        setStatus(baseStatus === "In Progress" ? "In Review" : baseStatus);
        
        setDailyReportRecordNumber(data.dailyReportRecordNumber || "");
        setDailyReportWorkStatus(data.dailyReportWorkStatus || "");
        setIssuesRecordNumber(data.issuesRecordNumber || "");
        setIssuesTitle(data.issuesTitle || "");
        setIssuesReportNumber(data.issuesReportNumber || "");

        if (data.resolutionAttachments && Array.from(data.resolutionAttachments).length > 0) {
          const loadedAttachments = data.resolutionAttachments.map((docObj: any, index: number) => ({
            id: `loaded-${index}`,
            name: getDocName(docObj, index),
            previewUrl: getDocUrl(docObj),
            logEntryRef: typeof docObj === 'object' ? docObj.logEntryRef || '' : '',
            source: typeof docObj === 'object' ? docObj.source || '' : '',
            sourceUrl: typeof docObj === 'object' ? docObj.sourceUrl || '' : '',
            notes: typeof docObj === 'object' ? docObj.notes || '' : '',
            isUploaded: true
          }));
          setPmAttachments(loadedAttachments);
        }
      }
    }).catch((err) => console.error("Error fetching root log:", err));

    // Dynamic stream for associated sub-observations containing line-item pictures
    const unsubSubObs = onSnapshot(collection(db, "field_observations", id, "sub_observations"), (subSnap) => {
      const items = subSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      items.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setSubObservationsList(items);
    }, (error) => console.error("Firestore sub_observations listener error:", error));

    const unsubQuestions = onSnapshot(collection(db, "field_observations", id, "portfolio_questions"), (snap) => {
      const qData = snap.docs.map(d => d.data());
      qData.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setPortfolioQuestionsFeed(qData);
    }, (error) => console.error("Firestore portfolio_questions listener error:", error));

    const unsubPmComments = onSnapshot(collection(db, "field_observations", id, "pm_comments"), (snap) => {
      const cData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      cData.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setPmCommentsHistory(cData);
    }, (error) => console.error("Firestore pm_comments listener error:", error));

    return () => {
      unsubSubObs();
      unsubQuestions();
      unsubPmComments(); 
    };
  }, [id]);

  const handlePmFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newAttachments = Array.from(files).map(file => ({
      file,
      name: file.name,
      id: crypto.randomUUID(),
      previewUrl: URL.createObjectURL(file),
      logEntryRef: '',
      source: '',
      sourceUrl: '',
      notes: ''
    }));

    setPmAttachments([...pmAttachments, ...newAttachments]);
  };

  const removePmAttachment = (attachmentId: string) => {
    setPmAttachments(pmAttachments.filter(a => a.id !== attachmentId));
  };

  const handleSavePMReview = async () => {
    if (isReadOnly) return;
    setIsSaving(true);
    
    toast({ title: "Review Synchronized", description: "Log entries pushed to Firestore." });
    
    try {
      const docRef = doc(db, "field_observations", id);
      const currentUser = auth.currentUser?.email || "Unknown PM";
      const timestamp = new Date().toISOString();
      
      const storageInstance = getStorage();
      const resolutionPayload: any[] = [];

      for (const item of pmAttachments) {
        let downloadUrl = '';
        
        if (item.file && item.file instanceof File) {
          const file = item.file;
          const fileExt = file.name.split('.').pop() || 'jpg';
          const storagePath = `closeout_documents/${id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
          const fileRef = storageRef(storageInstance, storagePath);

          let contentType = file.type;
          if (file.name.toLowerCase().endsWith('.heic')) {
            contentType = 'image/heic';
          } else if (file.name.toLowerCase().endsWith('.heif')) {
            contentType = 'image/heif';
          } else if (file.name.toLowerCase().endsWith('.pdf')) {
            contentType = 'application/pdf';
          }
          if (!contentType) {
            contentType = 'image/jpeg';
          }

          const metadata = { contentType };
          
          try {
            const uploadTaskSnapshot = await uploadBytesResumable(fileRef, file, metadata);
            downloadUrl = await getDownloadURL(uploadTaskSnapshot.ref);
          } catch (uploadError) {
            console.error("Storage upload failure:", uploadError);
            toast({
              variant: "destructive",
              title: "Upload Failed",
              description: `Failed to upload "${file.name}". Aborting review save.`
            });
            setIsSaving(false);
            return;
          }
        } else {
          downloadUrl = getDocUrl(item);
        }

        if (downloadUrl && !downloadUrl.startsWith('blob:')) {
          resolutionPayload.push({
            url: downloadUrl,
            name: item.name || 'Resolution Attachment',
            logEntryRef: item.logEntryRef || '',
            source: item.source || '',
            sourceUrl: item.sourceUrl || '',
            notes: item.notes || ''
          });
        }
      }

      const updatePayload = {
        location, 
        description, 
        resolutionType,
        status,
        dailyReportRecordNumber,
        dailyReportWorkStatus,
        issuesRecordNumber,
        issuesTitle,
        issuesReportNumber,
        lastUpdatedBy: currentUser,
        lastUpdatedAt: timestamp,
        resolutionAttachments: resolutionPayload
      };

      updateDoc(docRef, updatePayload);

      if (comment.trim() !== "") {
        addDoc(collection(db, "field_observations", id, "pm_comments"), {
          text: comment,
          author: currentUser,
          statusAtTime: status,
          createdAt: timestamp
        });
      }

      setComment(""); 
      router.push("/dashboard");
    } catch (error) {
      toast({ variant: "destructive", title: "Sync Error", description: "Failed to log metrics." });
    } finally {
      setIsSaving(false);
    }
  };

  const submitPortfolioQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (portfolioQuestion.trim() === "") return;

    try {
      const currentUser = auth.currentUser?.email || "Project Manager";
      const timestamp = new Date().toISOString();
      let isMentionTriggered = false;
      let targetUserTag = "";

      // 1. 🔍 RESOLUTION ENGINE: Scan text directly for full names inserted by the autocomplete UI
      const mentionedUser = PROJECT_TEAM.find(user => portfolioQuestion.includes(`@${user.name}`));

      if (mentionedUser) {
        isMentionTriggered = true;
        targetUserTag = mentionedUser.handle; // Maps full name directly to real handle (e.g., "kassie")
      } else if (portfolioQuestion.includes("@")) {
        // Fallback legacy behavior in case a user types a raw short handle manually
        const parts = portfolioQuestion.split("@");
        if (parts[1]) {
          isMentionTriggered = true;
          targetUserTag = parts[1].split(" ")[0].trim();
        }
      }

      // 2. Log the comment directly to the active field observation feed
      await addDoc(collection(db, "field_observations", id, "portfolio_questions"), {
        text: portfolioQuestion,
        author: currentUser,
        createdAt: timestamp,
        mentionFlag: isMentionTriggered,
        notifiedTarget: targetUserTag
      });

      // 3. 🔔 RELIABLE NOTIFICATION DISPATCHER
      if (isMentionTriggered && targetUserTag) {
        const usersRef = collection(db, "users");
        let targetUserId = null;

        // Route A: Search by unique database username index
        const qUser = query(usersRef, where("username", "==", targetUserTag.toLowerCase()));
        const userSnap = await getDocs(qUser);

        if (!userSnap.empty) {
          targetUserId = userSnap.docs[0].id;
        } else if (mentionedUser) {
          // Route B Fallback: Look up by enterprise email registry to catch missing handles
          const qEmail = query(usersRef, where("email", "==", mentionedUser.email));
          const emailSnap = await getDocs(qEmail);
          if (!emailSnap.empty) {
            targetUserId = emailSnap.docs[0].id;
          }
        }

        // If a valid target document profile anchor exists, ring the alert bell icon
        if (targetUserId) {
          await addDoc(collection(db, "users", targetUserId, "notifications"), {
            type: "mention",
            projectId: obs?.projectId || "Unknown Project",
            projectName: obs?.projectName || "Field Observation Alert",
            messageSummary: portfolioQuestion.slice(0, 100),
            timestamp,
            isRead: false
          });
        }
      }

      setPortfolioQuestion("");
      toast({ title: "Comment Transmitted", description: "Message logged and notification pushed to target user." });
    } catch (error) {
      console.error("Mention routing failure:", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to log comment." });
    }
  };

  const openImageModal = (url: string) => {
    setZoomScale(1);
    setActiveLightboxImg(url);
  };

  if (!obs) return <div className="p-8 text-slate-500 animate-pulse">Loading tracking metrics...</div>;

  return (
    <div className="max-w-6xl mx-auto pt-4 pb-12 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 print:block print:max-w-full print:p-0">
      
      {/* CSS Utilities Engine */}
      <style jsx global>{`
        @media print {
          nav, sidebar, aside, button, footer, form, .print\\:hidden {
            display: none !important;
          }
          body, main, .grid {
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
            width: 100% !important;
          }
          .print\\:full-width {
            width: 100% !important;
            max-width: 100% !important;
          }
          .print\\:no-border {
            border: none !important;
            box-shadow: none !important;
            background: transparent !important;
          }
          .print\\:scale-inline-img {
            height: 280px !important;
            width: 440px !important;
            object-fit: cover !important;
            margin-top: 8px !important;
            border-radius: 4px !important;
            border: 1px solid #cbd5e1 !important;
          }
        }

        .observation-card {
          display: flex;
          flex-direction: row;
          align-items: flex-start;
          gap: 16px;
          padding: 12px;
          margin-bottom: 12px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background-color: #ffffff;
          page-break-inside: avoid;
        }

        .thumbnail-wrapper {
          width: 160px;
          height: 160px;
          flex-shrink: 0;
          background-color: #f8fafc;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .thumbnail-wrapper img {
          max-width: 100%;
          max-height: 100%;
          width: auto;
          height: auto;
          object-fit: contain;
          display: block;
        }

        .details-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-size: 13px;
        }

        .detail-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .label {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          color: #0f172a;
          letter-spacing: 0.05em;
        }

        .source-document-link {
          color: #1d4ed8;
          text-decoration: underline;
          word-break: break-all;
          overflow-wrap: anywhere;
        }

        .no-image-placeholder {
          font-size: 11px;
          color: #94a3b8;
          text-align: center;
        }

        .form-select, .form-input, .form-textarea {
          width: 100%;
          padding: 6px 10px;
          font-size: 12px;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          background-color: #f8fafc;
          color: #334155;
          outline: none;
          transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
        }
        .form-select:focus, .form-input:focus, .form-textarea:focus {
          border-color: #3c38d4;
          background-color: #ffffff;
          box-shadow: 0 0 0 2px rgba(60, 56, 212, 0.1);
        }
        .form-textarea {
          resize: none;
        }
      `}</style>

      {/* Main Content Pane */}
      <div className="space-y-6 print:full-width">
        <div className="flex items-center justify-between print:border-b-2 print:border-slate-900 print:pb-2">
          <div className="space-y-1">
            <h1 className="text-2xl font-black text-[#3c38d4] tracking-tight print:text-black print:text-3xl uppercase">Field Observation Transmittal</h1>
            <p className="text-xs font-mono font-bold text-slate-500">RECORD ID: FOR-{id.toUpperCase()}</p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            {isReadOnly && (
              <Badge className="bg-purple-100 text-purple-800 border-purple-200 font-semibold gap-1 rounded-sm shadow-none">
                <ShieldAlert className="h-3 w-3" /> Executive Read-Only Active
              </Badge>
            )}
            <Button onClick={() => window.print()} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9 text-xs rounded-sm gap-1.5 cursor-pointer">
              <Printer className="h-4 w-4" /> Print Observation Form
            </Button>
          </div>
        </div>
        
        {/* Project Context Summary Meta Box */}
        <Card className="border border-slate-200 shadow-xs rounded-sm bg-white print:no-border">
          <CardContent className="p-6 print:p-0">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-medium text-slate-600 border-b pb-4 mb-6 print:border-slate-200 print:mb-6">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-slate-100 text-slate-700 rounded-sm print:hidden"><HardHat className="h-4 w-4 text-[#3c38d4]" /></div>
                <div><span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Project Scope</span><span className="text-slate-900 font-bold">{obs.projectName}</span></div>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-slate-100 text-slate-700 rounded-sm print:hidden"><Calendar className="h-4 w-4 text-[#3c38d4]" /></div>
                <div><span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Track & Stage</span><span className="text-slate-900 font-semibold">{obs.programName || obs.program} / {obs.stage}</span></div>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-slate-100 text-slate-700 rounded-sm print:hidden"><CloudSun className="h-4 w-4 text-[#3c38d4]" /></div>
                <div><span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Site Conditions</span><span className="text-slate-900 font-semibold">Weather: {obs.weather || "Controlled"}</span></div>
              </div>
            </div>

            {/* Sequential Line-Item Block Loop */}
            <div className="space-y-6">
              <label className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5 border-b pb-2 print:text-black print:border-slate-400">
                <ClipboardList className="h-4 w-4 text-[#3c38d4] print:hidden" /> Line-Item Field Observation Entries & Mapped Evidence
              </label>
              
              {subObservationsList.length === 0 ? (
                <div className="text-xs text-slate-400 italic text-center p-6 bg-slate-50 border border-dashed rounded-sm">
                  No discrete structural line entries captured on this checklist.
                </div>
              ) : (
                <div className="space-y-4">
                  {subObservationsList.map((item, index) => (
                    <div key={item.id} className="p-4 border border-slate-200 bg-white shadow-2xs rounded-sm space-y-3 print:border-slate-300 print:p-4 print:shadow-none break-inside-avoid">
                      <div className="flex items-center justify-between border-b pb-2 font-mono">
                        <span className="text-xs font-bold text-[#3c38d4] print:text-black">LOG ENTRY #{index + 1} ({item.observationType})</span>
                        <Badge className={`text-[9px] font-bold shadow-none rounded-xs ${item.priority === 'High' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-slate-50 text-slate-600'}`}>{item.priority} Priority</Badge>
                      </div>
                      
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider font-mono block print:text-slate-600">Observation Notes / Remarks:</span>
                        <p className="text-xs font-medium text-slate-800 leading-relaxed font-sans print:text-slate-900 whitespace-pre-wrap">{item.description}</p>
                      </div>
                      
                      {(() => {
                        const photos = getSubObsPhotos(item);
                        if (photos.length === 0) {
                          return <div className="text-[10px] text-slate-300 italic font-mono pt-1 print:hidden">-- No attachment bound to this row --</div>;
                        }

                        return (
                          <div className="pt-2">
                            <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 font-mono print:hidden">
                              Bound Media Frames ({photos.length}):
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 print-photo-grid">
                              {photos.map((photoUrl, pIdx) => (
                                <div 
                                  key={pIdx}
                                  onClick={() => openImageModal(photoUrl)}
                                  className="relative h-52 sm:h-60 w-full rounded-sm border border-slate-200 bg-slate-50 overflow-hidden shadow-xs cursor-pointer hover:border-[#3c38d4] transition-all group print-photo-card"
                                >
                                  <img 
                                    src={photoUrl} 
                                    alt={`Evidence Frame ${index + 1}-${pIdx + 1}`} 
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" 
                                  />
                                  <div className="absolute top-1.5 right-1.5 p-1.5 bg-black/70 text-white rounded-xs opacity-0 group-hover:opacity-100 transition-opacity print:hidden">
                                    <Maximize2 className="h-3 w-3"/>
                                  </div>
                                  <div className="absolute bottom-1 left-1.5 px-1.5 py-0.5 bg-black/60 text-[9px] font-mono font-bold text-white rounded-xs">
                                    Frame #{pIdx + 1}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Global Meta Fields Panel */}
            <div className="space-y-4 pt-6 border-t mt-6 print:space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1 print:text-black">Worksite Location Area Summary</label>
                <Input value={location} onChange={e => setLocation(e.target.value)} disabled={isReadOnly} className="bg-white rounded-xs border-slate-300 shadow-none disabled:opacity-100 disabled:bg-transparent print:border-none print:px-0 print:h-auto font-medium" />
              </div>
              <div className="print:hidden">
                <label className="block text-xs font-bold text-slate-900 mb-1">Global Transmittal Overview / Package Abstract</label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} disabled={isReadOnly} rows={2} className="bg-white rounded-xs border-slate-300 shadow-none resize-none" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cleaned Integration Logs (ProjectSight Completely Removed) */}
        <Card className="border border-slate-200 shadow-none rounded-none print:border-slate-300">
          <div className="bg-slate-100/80 px-6 py-3 border-b border-slate-200 print:bg-slate-50">
            <h2 className="text-xs font-bold text-slate-800 tracking-wide uppercase">Coupled Unifier System Integration Records</h2>
          </div>
          <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 print:p-4 print:gap-4">
            <div className="space-y-4 border-r pr-6 border-slate-100 print:border-slate-200 print:space-y-2">
              <h3 className="text-xs font-bold text-[#3c38d4] uppercase tracking-wider print:text-black">Unifier Daily Reports Mapping</h3>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Daily Report Record Number</label>
                <Input value={dailyReportRecordNumber} onChange={e => setDailyReportRecordNumber(e.target.value)} disabled={isReadOnly} className="bg-white rounded-none border-slate-300 shadow-none h-9 text-xs print:border-none print:h-auto print:p-0 font-mono" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Daily Report Work Status</label>
                <Input value={dailyReportWorkStatus} onChange={e => setDailyReportWorkStatus(e.target.value)} disabled={isReadOnly} className="bg-white rounded-none border-slate-300 shadow-none h-9 text-xs print:border-none print:h-auto print:p-0" />
              </div>
            </div>

            <div className="space-y-4 print:space-y-2">
              <h3 className="text-xs font-bold text-[#3c38d4] uppercase tracking-wider print:text-black">Unifier Management Issues</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Issues Record No.</label>
                  <Input value={issuesRecordNumber} onChange={e => setIssuesRecordNumber(e.target.value)} disabled={isReadOnly} className="bg-white rounded-none border-slate-300 shadow-none h-9 text-xs print:border-none print:h-auto print:p-0 font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Issues Report No.</label>
                  <Input value={issuesReportNumber} onChange={e => setIssuesReportNumber(e.target.value)} disabled={isReadOnly} className="bg-white rounded-none border-slate-300 shadow-none h-9 text-xs print:border-none print:h-auto print:p-0 font-mono" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Issues Subject Title Abstract</label>
                <Input value={issuesTitle} onChange={e => setIssuesTitle(e.target.value)} disabled={isReadOnly} className="bg-white rounded-none border-slate-300 shadow-none h-9 text-xs print:border-none print:h-auto print:p-0" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resolution Control Vectors */}
        <div className="grid grid-cols-2 gap-6 print:gap-4 text-xs">
          <div>
            <label className="block text-xs font-bold text-slate-900 mb-1">Resolution Designation Type</label>
            <div className="hidden print:block font-medium text-sm p-1">{resolutionType}</div>
            <Select value={resolutionType} onValueChange={setResolutionType} disabled={isReadOnly}>
              <SelectTrigger className="bg-white rounded-none shadow-none border-slate-300 print:hidden"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="General">General</SelectItem>
                <SelectItem value="Risk">Risk / Mitigation</SelectItem>
                <SelectItem value="Design Change">Design Change</SelectItem>
                <SelectItem value="Safety">Safety Incident</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-900 mb-1">Resolution Status</label>
            <div className="hidden print:block font-bold text-sm text-[#142E88] p-1">{status}</div>
            <Select value={status} onValueChange={setStatus} disabled={isReadOnly}>
              <SelectTrigger className="bg-white rounded-none shadow-none border-slate-300 print:hidden"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="New">New</SelectItem>
                <SelectItem value="In Review">In Review</SelectItem>
                <SelectItem value="Accepted">Accepted</SelectItem>
                <SelectItem value="Rejected">Rejected</SelectItem>
                <SelectItem value="Closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* PM Resolution Comment History Log Ledger (Printed in place of Chat Logs) */}
        <div className="space-y-2 break-inside-avoid">
          <label className="block text-xs font-bold text-slate-900 uppercase tracking-wide print:text-black">
            PM Resolution History & Management Audit Trail
          </label>
          {pmCommentsHistory.length === 0 ? (
            <div className="text-xs text-slate-400 italic bg-slate-50 p-4 border border-dashed rounded-sm text-center">
              No historical resolution tracking comments committed to this timeline file yet.
            </div>
          ) : (
            <div className="border border-slate-200 divide-y divide-slate-100 bg-white rounded-sm max-h-[300px] overflow-y-auto print:max-h-none print:border-slate-300 print:divide-slate-200">
              {pmCommentsHistory.map((log: any, idx: number) => (
                <div key={log.id || idx} className="p-3 text-xs space-y-1 bg-white">
                  <div className="flex items-center justify-between text-[10px] font-mono font-bold text-slate-400 print:text-slate-500">
                    <span className="text-[#3c38d4] print:text-black font-sans font-bold">{log.author?.split('@')[0] || "Systems PM"}</span>
                    <span>{log.createdAt ? new Date(log.createdAt).toLocaleString() : ""}</span>
                  </div>
                  <p className="text-slate-700 font-medium leading-relaxed font-sans print:text-slate-900">{log.text}</p>
                  <div className="pt-0.5">
                    <span className="text-[9px] font-bold font-mono px-1.5 py-0.2 bg-blue-50 text-[#142E88] border border-blue-100 rounded-xs print:bg-transparent print:text-slate-600 print:border-slate-300">
                      MILESTONE STATE: {log.statusAtTime || "In Review"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Closeout Document Logs */}
        {pmAttachments.length > 0 && (
          <div className="space-y-3 break-inside-avoid pt-2">
            <label className="block text-xs font-bold text-slate-900 uppercase tracking-wide print:text-black">
              Resolution Closeout Document Logs & References
            </label>
            
            <div className="space-y-3">
              {pmAttachments.map((att, idx) => (
                <CloseoutCard
                  key={att.id || idx}
                  att={att}
                  idx={idx}
                  isReadOnly={isReadOnly}
                  subObservationsList={subObservationsList}
                  updateAttachmentMeta={updateAttachmentMeta}
                  openImageModal={openImageModal}
                />
              ))}
            </div>
          </div>
        )}

        {/* Editing Inputs Footer Block */}
        {!isReadOnly && (
          <div className="space-y-4 print:hidden border-t pt-4">
            <div>
              <label className="block text-xs font-bold text-slate-900 mb-1">Append New Resolution Comment</label>
              <Textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Type closeout documentation comments or analysis here..." rows={3} className="bg-white rounded-none border-slate-300 shadow-none resize-none" />
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                <Paperclip className="h-3.5 w-3.5 text-[#5241db]" /> Upload New Supporting Closeout Documents
              </label>
              <div className="border border-dashed border-slate-300 bg-white p-4 rounded-sm space-y-3">
                <input type="file" id="pm-review-upload" multiple accept="image/*,.pdf" className="hidden" onChange={handlePmFileChange} />
                <Button type="button" variant="outline" onClick={() => document.getElementById("pm-review-upload")?.click()} className="h-8 text-xs font-bold border-slate-200 rounded-xs flex items-center gap-1 cursor-pointer">Choose PDFs or Images</Button>
                {pmAttachments.filter(a => !a.isUploaded).length > 0 && <div className="text-[10px] text-amber-600 font-medium">New uncommitted files added. Click 'Commit PM Resolution' to save.</div>}
              </div>
            </div>
          </div>
        )}

        {/* Interface Navigation Actions */}
        <div className="flex gap-4 pt-4 border-t print:hidden">
          <Button variant="outline" asChild className="w-48 bg-[#e9ecef] border-none text-slate-700 hover:bg-[#dee2e6] rounded-sm h-10 text-xs font-bold cursor-pointer">
            <Link href="/dashboard"><ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to Dashboard</Link>
          </Button>
          {!isReadOnly && (
            <Button onClick={handleSavePMReview} disabled={isSaving} className="w-48 bg-[#5241db] hover:bg-[#4335b3] text-white rounded-sm h-10 text-xs font-bold cursor-pointer">
              {isSaving ? "Saving Review..." : "Commit PM Resolution"}
            </Button>
          )}
        </div>
      </div>

      {/* Right Side Sticky Canvas Chat Feed Pane (Hidden during Print layout updates) */}
      <Card className="border border-slate-200 h-[calc(100vh-140px)] flex flex-col bg-slate-50/50 rounded-none shadow-none shrink-0 sticky top-4 print:hidden">
        <div className="p-4 border-b bg-white flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-[#3c38d4]" />
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Chat Log Feed</h3>
            <p className="text-[10px] text-slate-400">Contextual alignment log</p>
          </div>
        </div>

        {/* Scrolling Message History Log Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
          {portfolioQuestionsFeed.length === 0 ? (
            <div className="text-center text-slate-400 pt-12 italic">
              No chat logs or alignment mentions flagged on this layout yet.
            </div>
          ) : (
            portfolioQuestionsFeed.map((q, idx) => (
              <div key={idx} className={`bg-white border p-2.5 rounded shadow-2xs space-y-1 ${q.mentionFlag ? "border-amber-300 bg-amber-50/30" : ""}`}>
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold">
                  <span className="truncate max-w-[140px] text-[#3c38d4]">{q.author.split('@')[0]}</span>
                  <span>{q.createdAt ? q.createdAt.split('T')[1].slice(0, 5) : ""}</span>
                </div>
                <p className="text-slate-700 font-medium leading-relaxed">
                  {q.text}
                </p>
              </div>
            ))
          )}
        </div>

        {/* 🆕 AUTOCOMPLETE DROP-DOWN SELECTION BOX & INPUT CONTROLS */}
        <div className="p-3 border-t bg-white relative">
          {showDropdown && filteredTeam.length > 0 && (
            <div className="absolute bottom-full mb-2 left-2 right-2 bg-slate-900 border border-slate-700 text-white rounded shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-100">
              <div className="px-2.5 py-1 bg-slate-800 text-[9px] font-mono font-black uppercase text-slate-400 border-b border-slate-700 tracking-wider">
                Project Core Directory Mentions
              </div>
              <ul className="max-h-40 overflow-y-auto divide-y divide-slate-800">
                {filteredTeam.map((user, idx) => {
                  const isCurrent = idx === selectedIndex;
                  return (
                    <li
                      key={user.email}
                      onClick={() => {
                        const words = portfolioQuestion.split(" ");
                        words.pop(); // Remove the partial text token (like "@k")
                        setPortfolioQuestion([...words, `@${user.name} `].join(" "));
                        setShowDropdown(false);
                      }}
                      className={`px-3 py-1.5 text-xs flex flex-col cursor-pointer transition-colors ${
                        isCurrent ? "bg-[#3c38d4] text-white" : "hover:bg-slate-800/60 text-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span>{user.name}</span>
                        <span className="text-[8px] bg-slate-800 text-slate-400 px-1 py-0.5 rounded font-sans uppercase">
                          {user.role}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <form 
            onSubmit={submitPortfolioQuestion} 
            className="flex items-center gap-1.5"
            onKeyDown={(e) => {
              if (showDropdown && filteredTeam.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSelectedIndex((prev) => (prev + 1) % filteredTeam.length);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSelectedIndex((prev) => (prev - 1 + filteredTeam.length) % filteredTeam.length);
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const words = portfolioQuestion.split(" ");
                  words.pop(); // Remove the typed filter tag
                  setPortfolioQuestion([...words, `@${filteredTeam[selectedIndex].name} `].join(" "));
                  setShowDropdown(false);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setShowDropdown(false);
                }
              }
            }}
          >
            <Input 
              value={portfolioQuestion}
              onChange={(e) => {
                const text = e.target.value;
                setPortfolioQuestion(text);
                
                const words = text.split(" ");
                const lastWord = words[words.length - 1];
                
                if (lastWord && lastWord.startsWith("@")) {
                  setShowDropdown(true);
                  setMentionSearch(lastWord.slice(1));
                  setSelectedIndex(0);
                } else {
                  setShowDropdown(false);
                }
              }}
              placeholder="Type comment... use @ to mention team members"
              className="h-8 text-xs border-slate-200 shadow-none focus-visible:ring-1 focus-visible:ring-[#3c38d4] rounded-sm bg-white"
            />
            <Button type="submit" size="sm" className="bg-[#3c38d4] hover:bg-[#2b27b5] h-8 w-8 p-0 rounded-sm shrink-0 cursor-pointer">
              <Send className="h-3 w-3 text-white" />
            </Button>
          </form>
        </div>
      </Card>

      {/* Full Screen Lightbox Modal Canvas overlay */}
      {activeLightboxImg && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 print:hidden">
          <div className="absolute top-4 inset-x-4 flex items-center justify-between z-10 text-white">
            <div className="text-xs font-mono tracking-widest text-slate-400 bg-slate-900/60 px-3 py-1.5 rounded border border-slate-800">
              ZOOM: {(zoomScale * 100).toFixed(0)}%
            </div>
            <div className="flex items-center gap-2">
              <Button 
                onClick={() => setZoomScale(prev => Math.min(3, prev + 0.25))}
                variant="outline" size="sm" className="bg-slate-900 border-slate-800 text-white hover:bg-slate-800 h-8 w-8 p-0"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button 
                onClick={() => setZoomScale(prev => Math.max(0.5, prev - 0.25))}
                variant="outline" size="sm" className="bg-slate-900 border-slate-800 text-white hover:bg-slate-800 h-8 w-8 p-0"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button 
                onClick={() => setActiveLightboxImg(null)}
                variant="destructive" size="sm" className="h-8 rounded px-3 text-xs font-bold gap-1"
              >
                <X className="h-4 w-4" /> Close View
              </Button>
            </div>
          </div>

          <div className="w-full h-full flex items-center justify-center overflow-auto p-8 select-none">
            <img 
              src={activeLightboxImg} 
              alt="Expanded high-resolution trace view" 
              className="max-w-full max-h-full object-contain shadow-2xl rounded-sm transition-transform duration-200 ease-out"
              style={{ transform: `scale(${zoomScale})` }}
            />
          </div>
        </div>
      )}

    </div>
  );
}
