"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, HardDrive, RefreshCw, SearchCheck } from "lucide-react";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type AuditReference = {
  parentObservationId: string;
  subObservationId: string;
  itemNumber: string;
  source: string;
  originalFileName?: string;
  verificationStatus?: string;
};

type AuditItem = {
  storagePath: string | null;
  sizeBytes?: number;
  contentType?: string;
  createdAt?: string | null;
  reason?: string;
  references: AuditReference[];
};

type AuditResult = {
  readOnly: boolean;
  generatedAt: string;
  bucket: string;
  summary: {
    totalObjects: number;
    referencedObjects: number;
    zeroByte: number;
    missing: number;
    orphaned: number;
    verified: number;
    unverified: number;
  };
  zeroByte: AuditItem[];
  missing: AuditItem[];
  orphaned: AuditItem[];
  verified: AuditItem[];
  unverified: AuditItem[];
};

const AuditSection = ({ title, description, items, tone }: {
  title: string;
  description: string;
  items: AuditItem[];
  tone: "danger" | "warning" | "success" | "neutral";
}) => {
  const toneClasses = {
    danger: "border-red-200 bg-red-50 text-red-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
  };

  return (
    <details className="border border-slate-200 bg-white" open={tone === "danger" && items.length > 0}>
      <summary className="cursor-pointer list-none p-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500 mt-1">{description}</p>
        </div>
        <Badge className={`${toneClasses[tone]} shadow-none rounded-sm`}>{items.length}</Badge>
      </summary>
      <div className="border-t border-slate-200 overflow-x-auto">
        {items.length === 0 ? (
          <p className="p-4 text-xs text-slate-500">No records in this category.</p>
        ) : (
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase tracking-wide text-[10px]">
              <tr>
                <th className="p-3">Storage object</th>
                <th className="p-3">Bytes / Type</th>
                <th className="p-3">Field Observation references</th>
                <th className="p-3">Finding</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={`${item.storagePath || "unresolved"}-${index}`} className="border-t border-slate-100 align-top">
                  <td className="p-3 font-mono text-[10px] break-all max-w-[300px]">{item.storagePath || "Unresolved URL"}</td>
                  <td className="p-3 font-mono whitespace-nowrap">
                    {typeof item.sizeBytes === "number" ? `${item.sizeBytes.toLocaleString()} bytes` : "N/A"}
                    {item.contentType && <span className="block text-[10px] text-slate-400">{item.contentType}</span>}
                  </td>
                  <td className="p-3 space-y-1">
                    {item.references.length === 0 ? <span className="text-slate-400">No Firestore reference</span> : item.references.map((reference, referenceIndex) => (
                      <div key={`${reference.subObservationId}-${referenceIndex}`} className="font-mono text-[10px]">
                        {reference.parentObservationId} / {reference.itemNumber} / {reference.source}
                        {reference.originalFileName ? ` / ${reference.originalFileName}` : ""}
                      </div>
                    ))}
                  </td>
                  <td className="p-3 text-slate-600">{item.reason || (item.sizeBytes === 0 ? "Stored object contains zero bytes." : "See category classification.")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </details>
  );
};

export default function EvidenceIntegrityAuditPage() {
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const runAudit = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await auth.authStateReady();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Sign in before running the evidence audit.");
      const token = await currentUser.getIdToken();
      const response = await fetch("/api/evidence-integrity", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Evidence integrity audit failed.");
      setAudit(result);
    } catch (auditError: any) {
      setError(auditError.message || "Evidence integrity audit failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void runAudit();
  }, [runAudit]);

  const downloadAudit = () => {
    if (!audit) return;
    const blob = new Blob([JSON.stringify(audit, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `aviatrack-evidence-integrity-${audit.generatedAt.slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const summaryCards = audit ? [
    ["Zero-byte", audit.summary.zeroByte, "text-red-700"],
    ["Missing", audit.summary.missing, "text-red-700"],
    ["Orphaned", audit.summary.orphaned, "text-amber-700"],
    ["Verified", audit.summary.verified, "text-emerald-700"],
    ["Unverified", audit.summary.unverified, "text-amber-700"],
  ] : [];

  return (
    <main className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <SearchCheck className="h-5 w-5 text-[#142E88]" />
            <h1 className="text-xl font-bold text-slate-900">Evidence Integrity Audit</h1>
            <Badge variant="outline" className="rounded-sm text-[10px]">Read only</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">Reports Storage integrity and Firestore reference health. This screen never changes or deletes evidence.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild className="rounded-sm">
            <Link href="/dashboard/admin"><ArrowLeft className="h-4 w-4 mr-1" /> Admin</Link>
          </Button>
          <Button variant="outline" onClick={downloadAudit} disabled={!audit} className="rounded-sm">
            <Download className="h-4 w-4 mr-1" /> Export JSON
          </Button>
          <Button onClick={() => void runAudit()} disabled={loading} className="rounded-sm bg-[#142E88] text-white">
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {loading && !audit ? (
        <div className="py-20 text-center text-sm text-slate-500"><RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />Scanning evidence objects and references…</div>
      ) : audit ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {summaryCards.map(([label, value, color]) => (
              <Card key={String(label)} className="rounded-sm shadow-none">
                <CardHeader className="p-3 pb-1"><CardTitle className="text-[10px] uppercase tracking-wide text-slate-500">{label}</CardTitle></CardHeader>
                <CardContent className={`p-3 pt-0 text-2xl font-bold ${color}`}>{value}</CardContent>
              </Card>
            ))}
          </div>

          <div className="border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600 flex flex-wrap gap-x-6 gap-y-1 font-mono">
            <span><HardDrive className="inline h-3.5 w-3.5 mr-1" />{audit.bucket}</span>
            <span>{audit.summary.totalObjects} objects</span>
            <span>{audit.summary.referencedObjects} referenced</span>
            <span>Generated {new Date(audit.generatedAt).toLocaleString()}</span>
          </div>

          <div className="space-y-3">
            <AuditSection title="Zero-byte evidence" description="Objects retained for investigation; this audit does not delete or replace them." items={audit.zeroByte} tone="danger" />
            <AuditSection title="Missing references" description="Firestore evidence references that do not resolve to an existing Storage object." items={audit.missing} tone="danger" />
            <AuditSection title="Unreferenced / orphaned objects" description="Storage objects with no matching Field Observation evidence reference." items={audit.orphaned} tone="warning" />
            <AuditSection title="Unverified referenced evidence" description="Non-empty referenced objects without a matching verified manifest and byte-count evidence." items={audit.unverified} tone="warning" />
            <AuditSection title="Verified evidence" description="Objects whose stored size matches the committed verified manifest." items={audit.verified} tone="success" />
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> The audit is read-only. Existing FOR-1004 zero-byte objects remain preserved.
          </div>
        </>
      ) : null}
    </main>
  );
}
