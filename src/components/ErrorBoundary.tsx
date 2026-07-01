"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc } from "firebase/firestore";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught client-side error caught by ErrorBoundary:", error, errorInfo);
    
    // Pipe error stack directly into the central Firestore system_logs subcollection
    try {
      addDoc(collection(db, "admin_settings", "system_logs", "logs"), {
        errorMessage: error.message || "Unknown error",
        errorStack: error.stack || "No stack trace available",
        componentStack: errorInfo.componentStack || "",
        timestamp: new Date().toISOString(),
        userAgent: typeof window !== "undefined" ? window.navigator.userAgent : "Server-side",
        url: typeof window !== "undefined" ? window.location.href : "Unknown"
      }).then(() => {
        console.log("Error report piped to Firestore successfully.");
      }).catch((firestoreErr) => {
        console.error("Failed to write log to Firestore:", firestoreErr);
      });
    } catch (e) {
      console.error("Failed to execute firestore logging:", e);
    }
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 font-sans">
          <div className="max-w-md w-full bg-white border border-slate-200 p-8 shadow-xl space-y-6 text-center">
            <div className="bg-red-50 text-red-600 rounded-full p-4 h-16 w-14 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-slate-900">Application Interrupted</h2>
              <p className="text-xs text-slate-500 leading-normal">
                A critical client-side exception occurred. The technical details have been captured and piped to the central operations ledger.
              </p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded text-left overflow-x-auto max-h-32 text-[10px] font-mono text-slate-600">
              {this.state.error?.message}
            </div>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="bg-[#142E88] hover:bg-[#1f3ab3] text-white font-bold py-2.5 px-6 text-xs rounded-sm inline-flex items-center gap-2 cursor-pointer transition-all w-full justify-center"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Restart Application Session
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
