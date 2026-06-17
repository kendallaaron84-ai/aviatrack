// File: src/app/field/layout.tsx
"use client";

import { useState, useEffect } from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

export default function FieldLayout({ children }: { children: React.ReactNode }) {
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    // Check local storage / IndexedDB instantly for active credentials
    const unsubscribe = onAuthStateChanged(auth, () => {
      setIsInitializing(false);
    });
    return () => unsubscribe();
  }, []);

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-sm font-medium text-[#142E88] animate-pulse">
          Synchronizing AviaITrack Field Link...
        </div>
      </div>
    );
  } 

  return <>{children}</>;
}