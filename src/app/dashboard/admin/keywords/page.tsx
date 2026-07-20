// File: src/app/dashboard/admin/keywords/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, KeyRound, Sliders } from "lucide-react";

export default function KeywordManagementWindow() {
  const [keywords, setKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState("");

  // Live stream your tracking watch-list from Firestore
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "config_keywords"), (snapshot) => {
      setKeywords(snapshot.docs.map(d => d.id));
    }, (error) => console.error("Firestore config_keywords listener error:", error));
    return () => unsub();
  }, []);

  const handleAddKeyword = async (e: React.FormEvent) => {
    e.preventDefault();
    const sanitized = newKeyword.trim().toLowerCase();
    if (!sanitized || keywords.includes(sanitized)) return;

    // Save as document ID to enforce uniqueness natively
    await setDoc(doc(db, "config_keywords", sanitized), {
      addedAt: new Date().toISOString(),
      active: true
    });
    setNewKeyword("");
  };

  const handleRemoveKeyword = async (word: string) => {
    await deleteDoc(doc(db, "config_keywords", word));
  };

  return (
    <Card className="border-slate-200 shadow-sm bg-white max-w-xl">
      <CardHeader className="bg-slate-50 border-b py-3 flex flex-row items-center gap-2">
        <KeyRound className="h-4 w-4 text-[#142E88]" />
        <div>
          <CardTitle className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Cyber-Physical Impact Keyword Watchlist
          </CardTitle>
          <CardDescription className="text-[10px] text-slate-400">
            Define secondary non-vanilla tokens to scan across construction bulletins and drawing revisions.
          </CardDescription>
        </div>
      </CardHeader>
      
      <CardContent className="p-4 space-y-4">
        {/* Input Form */}
        <form onSubmit={handleAddKeyword} className="flex gap-2">
          <Input 
            placeholder="e.g. conduit pathway, fire alarm, door hardware" 
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            className="h-9 text-xs bg-white"
          />
          <Button type="submit" className="h-9 bg-[#142E88] text-white text-xs font-medium px-3 flex items-center gap-1 rounded-sm">
            <Plus className="h-3.5 w-3.5" /> Track Token
          </Button>
        </form>

        {/* Rendered Watchlist Area */}
        <div className="space-y-1.5">
          <span className="block font-mono text-[9px] uppercase font-bold text-slate-400 tracking-wider">Active Watch-list Elements</span>
          <div className="flex flex-wrap gap-2 p-3 bg-slate-50 border rounded-sm min-h-[80px]">
            {keywords.map((word) => (
              <Badge 
                key={word} 
                variant="secondary" 
                className="bg-white border-slate-200 shadow-none text-slate-700 text-xs py-1 px-2 font-mono flex items-center gap-1.5 rounded-sm"
              >
                <span>{word}</span>
                <button 
                  type="button" 
                  onClick={() => handleRemoveKeyword(word)}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {keywords.length === 0 && (
              <span className="text-[11px] text-slate-400 font-medium italic m-auto">No tracking keywords defined. System defaulting to vanilla IT filters.</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
