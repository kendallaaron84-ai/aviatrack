"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function RaidNumberingMigrationPage() {
  const [result, setResult] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);

  const runMigration = async (mode: "dry-run" | "apply") => {
    setIsRunning(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Authentication required.");
      const response = await fetch("/api/raid-numbering", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "RAID numbering migration failed.");
      setResult(data);
    } catch (error: any) {
      setResult({ error: error.message });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="p-6">
      <Card className="max-w-5xl">
        <CardHeader>
          <CardTitle>One-Time RAID Numbering Migration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">Run and inspect the dry-run before applying the deterministic canonical-record mapping.</p>
          <div className="flex gap-2">
            <Button disabled={isRunning} onClick={() => runMigration("dry-run")}>Run Dry-Run</Button>
            <Button disabled={isRunning || result?.mode !== "dry-run" || result?.duplicateRaidNumberCount !== 0} variant="destructive" onClick={() => runMigration("apply")}>Apply Verified Mapping</Button>
          </div>
          {result && <pre className="max-h-[65vh] overflow-auto border bg-slate-950 p-4 text-xs text-slate-50">{JSON.stringify(result, null, 2)}</pre>}
        </CardContent>
      </Card>
    </div>
  );
}
