// File: src/app/dashboard/financials/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { 
  DollarSign, Receipt, TrendingDown, ArrowRight, Plus, FileSpreadsheet, 
  X, ShoppingCart, Layers, Clock, ArrowUpRight, Printer 
} from "lucide-react";
import { db, auth } from "@/lib/firebase"; 

// Native Firebase Operations
import { collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, setDoc } from "firebase/firestore";

export default function FinancialTrackingPage() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModalSubmitting, setIsModalSubmitting] = useState(false);
  
  // FOUNDATIONAL STATE MATRIX
  const [projectsList, setProjectsList] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [activeProjectData, setActiveProjectData] = useState<any>(null);
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
  const [procurementEntries, setProcurementEntries] = useState<any[]>([]);

  // BUDGET EDIT & LOCK LIFE CYCLE CONTROLS
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [currentBudget, setCurrentBudget] = useState(0);
  const [isBudgetLocked, setIsBudgetLocked] = useState(true);

  // ADVANCE STAGE MODAL STATES
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [selectedPipelineItem, setSelectedPipelineItem] = useState<any>(null);
  const [advanceForm, setAdvanceForm] = useState({
    shoppingCartNumber: "",
    poNumber: "",
    cartActualAmount: ""
  });

  // PROCUREMENT MANAGEMENT MODAL STATE
  const [isProcurementModalOpen, setIsProcurementModalOpen] = useState(false);
  const [procurementForm, setProcurementForm] = useState({
    categoryVendor: "",
    estimateAmount: "",
    shoppingCartNumber: "",
    poNumber: "",
    cartActualAmount: "",
    lifecycleStage: "ESTIMATE"
  });

  const [ledgerForm, setLedgerForm] = useState({
    date: new Date().toISOString().split('T')[0],
    vendor: "",
    category: "Material/Equipment",
    materialAmount: "",
    laborAmount: "",
    poNumber: "",
    notes: ""
  });

  // LIVE STREAM MASTER ADMIN PROJECT DIRECTORY
  useEffect(() => {
    const unsubProjList = onSnapshot(collection(db, "admin_projects"), (snapshot) => {
      const projs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setProjectsList(projs);
      if (projs.length > 0 && !selectedProject) {
        setSelectedProject(projs[0].id);
      }
    });
    return () => unsubProjList();
  }, [selectedProject]);

  // Handle local context hydration
  useEffect(() => {
    if (!selectedProject || projectsList.length === 0) return;
    
    const active = projectsList.find(p => p.id === selectedProject);
    if (active) {
      setActiveProjectData(active);
      setCurrentBudget(active.budget || active.approvedBudget || 0);
      setIsBudgetLocked(true);
      setIsEditingBudget(false);
    }
  }, [selectedProject, projectsList]);

  // Main Data Ledger Stream Listener
  useEffect(() => {
    if (!selectedProject) return;

    const qLedger = query(collection(db, "financials", selectedProject, "ledger"), orderBy("date", "desc"));
    const unsubLedger = onSnapshot(qLedger, (snapshot) => {
      setLedgerEntries(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const qProcure = query(collection(db, "financials", selectedProject, "procurement_pipeline"), orderBy("timestamp", "desc"));
    const unsubProcure = onSnapshot(qProcure, (snapshot) => {
      if (!snapshot.empty) {
        setProcurementEntries(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      } else {
        setProcurementEntries([]);
      }
    });

    return () => { unsubLedger(); unsubProcure(); };
  }, [selectedProject]);

  // Combined calculations
  const totalSpent = ledgerEntries.reduce((sum, entry) => {
    return sum + parseFloat(entry.materialAmount || 0) + parseFloat(entry.laborAmount || 0) + parseFloat(entry.amount || 0);
  }, 0);

  const itsdAdminSpent = ledgerEntries
    .filter(e => e.category === "Labor")
    .reduce((sum, entry) => sum + parseFloat(entry.laborAmount || 0), 0);

  const variance = currentBudget - totalSpent;

  const handleUpdateBudgetDatabase = async () => {
    try {
      const projectDocRef = doc(db, "admin_projects", selectedProject);
      await updateDoc(projectDocRef, { budget: currentBudget });
      setIsBudgetLocked(true);
      setIsEditingBudget(false);
      toast({ title: "Baseline Locked", description: `Project reference baseline updated to $${currentBudget.toLocaleString()}` });
    } catch (err) {
      toast({ variant: "destructive", title: "Error locking baseline" });
    }
  };

  const handleLogTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ledgerForm.vendor) return;
    setIsSubmitting(true);

    try {
      const currentUser = auth.currentUser?.email || "Kendall Aaron";
      const timestamp = new Date().toISOString();
      const parsedMaterial = parseFloat(ledgerForm.materialAmount) || 0;
      const parsedLabor = parseFloat(ledgerForm.laborAmount) || 0;
      const combinedTransactionAmount = parsedMaterial + parsedLabor;

      const transactionPayload = {
        date: ledgerForm.date,
        vendor: ledgerForm.vendor,
        category: ledgerForm.category,
        materialAmount: parsedMaterial,
        laborAmount: parsedLabor,
        amount: combinedTransactionAmount,
        poNumber: ledgerForm.poNumber,
        notes: ledgerForm.notes,
        loggedBy: currentUser,
        timestamp: timestamp
      };

      await addDoc(collection(db, "financials", selectedProject, "ledger"), transactionPayload);
      
      // EXECUTIVE ROLLOUP SYNC
      const rollupDocRef = doc(db, "portfolio_rollups", selectedProject);
      await setDoc(rollupDocRef, {
        projectId: selectedProject,
        projectName: activeProjectData?.name || selectedProject,
        totalActualCost: totalSpent + combinedTransactionAmount,
        evmMetrics: {
          actualCost: totalSpent + combinedTransactionAmount,
          plannedValue: currentBudget,
          earnedValue: currentBudget - (variance - combinedTransactionAmount) > 0 ? currentBudget * 0.92 : currentBudget
        }
      }, { merge: true });

      toast({ title: "Ledger Updated", description: "Transaction committed and pushed to Executive Board." });
      setLedgerForm(prev => ({ ...prev, vendor: "", materialAmount: "", laborAmount: "", poNumber: "", notes: "" }));
    } catch (err) {
      toast({ variant: "destructive", title: "Error logging entry" });
    } finally { setIsSubmitting(false); }
  };

  const handleInitializeProcurement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!procurementForm.categoryVendor || !procurementForm.estimateAmount) return;
    setIsModalSubmitting(true);

    try {
      const currentUser = auth.currentUser?.email || "Kendall Aaron";
      const timestamp = new Date().toISOString();
      const parsedEstimate = parseFloat(procurementForm.estimateAmount) || 0;

      const procurementPayload = {
        categoryVendor: procurementForm.categoryVendor,
        estimateAmount: parsedEstimate,
        shoppingCartNumber: procurementForm.shoppingCartNumber || "N/A",
        poNumber: procurementForm.poNumber || "N/A",
        cartActualAmount: parseFloat(procurementForm.cartActualAmount) || 0,
        lifecycleStage: procurementForm.shoppingCartNumber ? "SHOPPING CART" : "ESTIMATE",
        loggedBy: currentUser,
        timestamp: timestamp
      };

      await addDoc(collection(db, "financials", selectedProject, "procurement_pipeline"), procurementPayload);
      setIsProcurementModalOpen(false);
      setProcurementForm({ categoryVendor: "", estimateAmount: "", shoppingCartNumber: "", poNumber: "", cartActualAmount: "", lifecycleStage: "ESTIMATE" });
      toast({ title: "Pipeline Envelope Created" });
    } catch (err) {
      toast({ variant: "destructive", title: "Write Error" });
    } finally { setIsModalSubmitting(false); }
  };

  const handleAdvancePipelineStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPipelineItem) return;

    try {
      const docRef = doc(db, "financials", selectedProject, "procurement_pipeline", selectedPipelineItem.id);
      let nextStage = "ESTIMATE";
      if (advanceForm.poNumber) nextStage = "PURCHASE ORDER";
      else if (advanceForm.shoppingCartNumber) nextStage = "SHOPPING CART";

      await updateDoc(docRef, {
        shoppingCartNumber: advanceForm.shoppingCartNumber || selectedPipelineItem.shoppingCartNumber,
        poNumber: advanceForm.poNumber || selectedPipelineItem.poNumber,
        cartActualAmount: parseFloat(advanceForm.cartActualAmount) || selectedPipelineItem.cartActualAmount,
        lifecycleStage: nextStage,
        lastAdvancedAt: new Date().toISOString()
      });

      setIsAdvanceModalOpen(false);
      setSelectedPipelineItem(null);
      toast({ title: "Procurement Lifecycle Advanced" });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 font-sans pb-12 print:max-w-none print:bg-white print:text-black">
      
      {/* 🖨️ PRINT ONLY HEADER (Invisible on screen, displays pristine layout on PDF) */}
      <div className="hidden print:block border-b-2 border-slate-900 pb-6 mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight uppercase">Financial Audit Report</h1>
        <h2 className="text-xl font-medium mt-2">{activeProjectData?.name || selectedProject}</h2>
        <div className="flex justify-center gap-6 mt-4 text-sm font-mono">
          <span>Target ID: {selectedProject}</span>
          <span>WBS: {activeProjectData?.wbs || "N/A"}</span>
          <span>Generated: {new Date().toLocaleDateString()}</span>
        </div>
      </div>

      {/* 🖥️ SCREEN HEADER SECTION (Invisible during print) */}
      <div className="flex items-center justify-between border-b pb-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-[#142E88]" />
            Project Financial Tracking
          </h1>
          <p className="text-sm text-slate-500 mt-1">Manage procurement pipelines, Shopping Carts, and split labor/material allocations.</p>
        </div>
        
        <div className="flex items-end gap-4">
          <Button 
            onClick={() => window.print()} 
            className="h-9 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-sm text-xs cursor-pointer"
          >
            <Printer className="h-4 w-4 mr-2" /> Generate Executive Audit
          </Button>

          <div className="w-72">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 block">Active Project Target</label>
            <select 
              value={selectedProject} 
              onChange={e => setSelectedProject(e.target.value)}
              className="w-full border border-slate-300 rounded-sm text-sm p-2 shadow-sm focus:ring-[#142E88] bg-white h-9 focus:outline-none font-sans font-medium text-slate-800"
            >
              {projectsList.map(p => <option key={p.id} value={p.id}>{p.id} - {p.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* HEALTH KPI TIER PANEL */}
      <div className="grid gap-4 md:grid-cols-4 print:grid-cols-4">
        <Card className="border-l-4 border-l-slate-400 rounded-sm shadow-sm bg-white print:shadow-none print:border">
          <CardContent className="p-5">
            <div className="flex justify-between items-start">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <Receipt className="h-4 w-4" /> Baseline Budget (Est)
              </p>
              {/* Hide unlock button on print */}
              <button 
                onClick={() => setIsBudgetLocked(!isBudgetLocked)} 
                className="text-[9px] font-mono border px-1.5 py-0.5 rounded-xs text-slate-500 hover:bg-slate-50 cursor-pointer print:hidden"
              >
                {isBudgetLocked ? "UNLOCK" : "CANCEL"}
              </button>
            </div>
            {!isBudgetLocked ? (
              <div className="flex gap-1.5 mt-2 print:hidden">
                <Input type="number" value={currentBudget} onChange={e => setCurrentBudget(parseFloat(e.target.value) || 0)} className="h-8 text-sm font-bold font-mono" />
                <Button size="sm" onClick={handleUpdateBudgetDatabase} className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs">LOCK</Button>
              </div>
            ) : (
              <p className="text-2xl font-bold text-slate-900 mt-2 print:text-black">${currentBudget.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
            )}
            <p className="text-[10px] text-slate-400 mt-1 font-mono print:text-black">WBS: {activeProjectData?.wbs || "Pending Sync"}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#142E88] rounded-sm shadow-sm bg-[#f8faff] print:bg-white print:shadow-none print:border">
          <CardContent className="p-5">
            <p className="text-[10px] font-bold text-[#142E88] uppercase tracking-widest flex items-center gap-1.5 print:text-black">
              <TrendingDown className="h-4 w-4" /> CMAR Contract Actuals
            </p>
            <p className="text-2xl font-bold text-[#142E88] mt-2 print:text-black">${(totalSpent - itsdAdminSpent).toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
            <p className="text-[10px] text-slate-500 mt-1 print:text-black">Sum of contractor materials & field labor</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500 rounded-sm shadow-sm bg-white print:shadow-none print:border">
          <CardContent className="p-5">
            <p className="text-[10px] font-bold text-purple-700 uppercase tracking-widest flex items-center gap-1.5 print:text-black">
              <Clock className="h-4 w-4" /> ITSD Staff Internal Costs
            </p>
            <p className="text-2xl font-bold text-purple-900 mt-2 print:text-black">${itsdAdminSpent.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
            <p className="text-[10px] text-slate-400 mt-1 print:text-black">Subtracted internal timesheet allocation</p>
          </CardContent>
        </Card>

        <Card className={`border-l-4 rounded-sm shadow-sm bg-white print:shadow-none print:border ${variance >= 0 ? 'border-l-emerald-500' : 'border-l-red-500'}`}>
          <CardContent className="p-5">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 print:text-black">
              <DollarSign className="h-4 w-4" /> Portfolio Variance
            </p>
            <p className={`text-2xl font-bold mt-2 print:text-black ${variance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              ${variance.toLocaleString(undefined, {minimumFractionDigits: 2})}
            </p>
            <p className="text-[10px] text-slate-500 mt-1 print:text-black">Remaining active capital pool</p>
          </CardContent>
        </Card>
      </div>

      {/* WORKING COLUMN SPLITS */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 print:block">
        
        <div className="space-y-6">
          {/* PROCUREMENT STATE MACHINE PIPELINE */}
          <Card className="border-slate-200 shadow-sm rounded-sm bg-white print:shadow-none">
            <CardHeader className="bg-slate-50 border-b py-3 print:bg-white">
              <CardTitle className="text-xs font-bold text-[#142E88] uppercase tracking-wider flex items-center gap-2 print:text-black">
                <ShoppingCart className="h-4 w-4" /> Multi-Stage Procurement Pipeline
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50 print:bg-white">
                    <TableHead className="text-xs font-bold text-slate-800 p-3 print:text-black">Scope Context / Target</TableHead>
                    <TableHead className="text-xs font-bold text-slate-800 w-32 print:text-black">Stage Status</TableHead>
                    <TableHead className="text-xs font-bold text-slate-800 w-32 print:text-black">Design Estimate</TableHead>
                    <TableHead className="text-xs font-bold text-slate-800 w-44 print:text-black">SAP Track Keys</TableHead>
                    <TableHead className="text-xs font-bold text-slate-800 w-32 print:text-black">Committed PO</TableHead>
                    {/* Hide empty action column header on print */}
                    <TableHead className="w-[80px] print:hidden"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {procurementEntries.map((item) => (
                    <TableRow key={item.id} className="hover:bg-slate-50/30">
                      <td className="text-xs font-bold text-slate-800 p-3 print:text-black">{item.categoryVendor}</td>
                      <td>
                        <Badge className={`text-[9px] font-mono shadow-none px-1.5 rounded-xs print:border-slate-400 print:text-black print:bg-white ${
                          item.lifecycleStage === "PURCHASE ORDER" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                          item.lifecycleStage === "SHOPPING CART" ? "bg-blue-50 text-blue-700 border border-blue-200" :
                          "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}>{item.lifecycleStage || "ESTIMATE"}</Badge>
                      </td>
                      <td className="text-xs font-mono font-medium text-slate-600 print:text-black">${parseFloat(item.estimateAmount || 0).toLocaleString()}</td>
                      <td className="text-[10px] font-mono text-slate-500 print:text-black">
                        <div className="truncate">SC: <strong>{item.shoppingCartNumber || "N/A"}</strong></div>
                        <div className="truncate">PO: <strong>{item.poNumber || "N/A"}</strong></div>
                      </td>
                      <td className="text-xs font-bold font-mono text-[#142E88] print:text-black">${parseFloat(item.cartActualAmount || 0).toLocaleString()}</td>
                      {/* Hide Advance Button Cell on Print */}
                      <td className="text-right pr-4 print:hidden">
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => {
                            setSelectedPipelineItem(item);
                            setAdvanceForm({
                              shoppingCartNumber: item.shoppingCartNumber === "N/A" ? "" : item.shoppingCartNumber,
                              poNumber: item.poNumber === "N/A" ? "" : item.poNumber,
                              cartActualAmount: item.cartActualAmount || ""
                            });
                            setIsAdvanceModalOpen(true);
                          }}
                          className="h-7 text-[10px] font-bold text-[#142E88] hover:bg-blue-50 px-2 rounded-xs cursor-pointer flex items-center gap-0.5"
                        >
                          Advance <ArrowUpRight className="h-3 w-3" />
                        </Button>
                      </td>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {/* Hide "Initialize Procurement" Button Bar on Print */}
              <div className="p-2.5 border-t bg-slate-50/50 flex justify-end print:hidden">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsProcurementModalOpen(true)} className="text-xs font-bold text-[#142E88] h-8 rounded-sm cursor-pointer hover:bg-white">
                  <Plus className="h-3 w-3 mr-1" /> Initialize Procurement Envelope
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* TIME STAMPED PAYMENT ACTUALS */}
          <Card className="border-slate-200 shadow-sm rounded-sm bg-white print:shadow-none print:mt-6">
            <CardHeader className="bg-slate-50 border-b py-3 print:bg-white">
              <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 print:text-black">
                <Layers className="h-4 w-4 text-slate-700" /> Time-stamped payment actuals
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/30 print:bg-white">
                    <TableHead className="text-xs font-bold p-3 print:text-black">Date</TableHead>
                    <TableHead className="text-xs font-bold print:text-black">Vendor/Trade Source</TableHead>
                    <TableHead className="text-xs font-bold print:text-black">Material Cost</TableHead>
                    <TableHead className="text-xs font-bold print:text-black">Labor Cost</TableHead>
                    <TableHead className="text-xs font-bold text-right pr-4 print:text-black">Combined Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerEntries.map((entry) => {
                    const mat = parseFloat(entry.materialAmount || 0);
                    const lab = parseFloat(entry.laborAmount || 0);
                    return (
                      <TableRow key={entry.id} className="hover:bg-slate-50/30">
                        <TableCell className="text-xs font-mono p-3 print:text-black">{entry.date}</TableCell>
                        <TableCell className="text-xs font-bold text-slate-800 print:text-black">
                          {entry.vendor}
                          <div className="text-[9px] text-slate-400 font-mono font-normal print:text-slate-600">Classification: {entry.category}</div>
                        </TableCell>
                        <TableCell className="text-xs text-blue-600 font-mono font-medium print:text-black">${mat.toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-purple-600 font-mono font-medium print:text-black">${lab.toLocaleString()}</TableCell>
                        <TableCell className="text-xs font-bold text-red-600 text-right pr-4 font-mono print:text-black">${(mat+lab).toLocaleString()}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* LOG PANEL FORM RIGHT (Completely hidden during print so the ledger uses full width) */}
        <div className="print:hidden">
          <Card className="border-[#142E88] shadow-md rounded-sm bg-white sticky top-6">
            <div className="bg-[#142E88] text-white px-4 py-2.5 rounded-t-sm">
              <h2 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                Log Monthly Actuals / Timesheets
              </h2>
            </div>
            <CardContent className="p-4">
              <form onSubmit={handleLogTransaction} className="space-y-3.5 text-xs font-medium">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Transaction Date</label>
                  <Input type="date" value={ledgerForm.date} onChange={e => setLedgerForm({...ledgerForm, date: e.target.value})} className="h-8 text-xs bg-white" required />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Source / Team Entry</label>
                  <Input placeholder="e.g., ITSD Staffing, Alterman Electrical" value={ledgerForm.vendor} onChange={e => setLedgerForm({...ledgerForm, vendor: e.target.value})} className="h-8 text-xs bg-white" required />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Cost Classification Category</label>
                  <select value={ledgerForm.category} onChange={e => setLedgerForm({...ledgerForm, category: e.target.value})} className="w-full border p-1.5 text-xs rounded-sm bg-white h-8 focus:outline-none">
                    <option value="Material/Equipment">Material / Equipment (CMAR)</option>
                    <option value="Labor">ITSD Admin Staff Hours (Timesheet)</option>
                    <option value="Contractor Labor">Contractor Field Labor (CMAR)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-blue-600 font-bold uppercase tracking-wide mb-1">Material Allocation ($)</label>
                  <Input type="number" step="0.01" placeholder="0.00" value={ledgerForm.materialAmount} onChange={e => setLedgerForm({...ledgerForm, materialAmount: e.target.value})} className="h-8 text-xs font-mono bg-blue-50/20 text-blue-600 border-blue-200" />
                </div>
                <div>
                  <label className="block text-purple-600 font-bold uppercase tracking-wide mb-1">Labor/Timesheet Allocation ($)</label>
                  <Input type="number" step="0.01" placeholder="0.00" value={ledgerForm.laborAmount} onChange={e => setLedgerForm({...ledgerForm, laborAmount: e.target.value})} className="h-8 text-xs font-mono bg-purple-50/20 text-purple-600 border-purple-200" />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Accounting Notes</label>
                  <Input placeholder="Notes..." value={ledgerForm.notes} onChange={e => setLedgerForm({...ledgerForm, notes: e.target.value})} className="h-8 text-xs bg-white" />
                </div>
                <Button type="submit" disabled={isSubmitting} className="w-full bg-[#142E88] hover:bg-[#2018b3] text-white font-bold h-9 text-xs cursor-pointer">Commit Transaction</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* INITIALIZE PROCUREMENT MODAL */}
      {isProcurementModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150 print:hidden">
          <div className="bg-white border border-slate-200 w-full max-w-sm shadow-2xl rounded-sm overflow-hidden text-slate-900">
            <div className="bg-[#142E88] text-white px-4 py-2.5 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider">Initialize Procurement Envelope</h3>
              <button type="button" onClick={() => setIsProcurementModalOpen(false)} className="text-slate-300 hover:text-white cursor-pointer"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={handleInitializeProcurement} className="p-4 space-y-4 text-xs font-medium">
              <div>
                <label className="block text-slate-700 mb-1 font-bold">Category Scope / Vendor Target</label>
                <Input placeholder="e.g., Infrastructure (ComSol)" value={procurementForm.categoryVendor} onChange={e => setProcurementForm({...procurementForm, categoryVendor: e.target.value})} className="h-8 text-xs" required />
              </div>
              <div>
                <label className="block text-slate-700 mb-1 font-bold">Projected Baseline Estimate ($)</label>
                <Input type="number" step="0.01" placeholder="0.00" value={procurementForm.estimateAmount} onChange={e => setProcurementForm({...procurementForm, estimateAmount: e.target.value})} className="h-8 text-xs font-mono font-bold" required />
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsProcurementModalOpen(false)} className="flex-1 h-8 rounded-none text-xs cursor-pointer">Cancel</Button>
                <Button type="submit" disabled={isModalSubmitting} className="flex-1 bg-[#142E88] text-white font-bold h-8 text-xs cursor-pointer">Create Envelope</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADVANCE STAGE LIFECYCLE MODAL */}
      {isAdvanceModalOpen && selectedPipelineItem && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150 print:hidden">
          <div className="bg-white border border-slate-200 w-full max-w-sm shadow-2xl rounded-sm overflow-hidden text-slate-900">
            <div className="bg-[#142E88] text-white px-4 py-2.5 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider">Advance Lifecycle: {selectedPipelineItem.categoryVendor}</h3>
              <button type="button" onClick={() => setIsAdvanceModalOpen(false)} className="text-slate-300 hover:text-white cursor-pointer"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={handleAdvancePipelineStage} className="p-4 space-y-4 text-xs font-medium">
              <div className="bg-slate-50 p-2.5 border rounded-sm font-mono text-[11px] text-slate-500">
                Original Design Estimate: <span className="font-bold text-slate-800">${parseFloat(selectedPipelineItem.estimateAmount || 0).toLocaleString()}</span>
              </div>
              <div>
                <label className="block text-slate-700 mb-1 font-bold">Shopping Cart (SC) Number</label>
                <Input placeholder="e.g., 2000959000" value={advanceForm.shoppingCartNumber} onChange={e => setAdvanceForm({...advanceForm, shoppingCartNumber: e.target.value})} className="h-8 text-xs font-mono bg-white" />
              </div>
              <div>
                <label className="block text-slate-700 mb-1 font-bold">Purchase Order (PO) Number</label>
                <Input placeholder="e.g., 8000564746" value={advanceForm.poNumber} onChange={e => setAdvanceForm({...advanceForm, poNumber: e.target.value})} className="h-8 text-xs font-mono bg-white" />
              </div>
              <div>
                <label className="block text-[#142E88] mb-1 font-bold">Active Encumbered / Committed Value ($)</label>
                <Input type="number" step="0.01" placeholder="0.00" value={advanceForm.cartActualAmount} onChange={e => setAdvanceForm({...advanceForm, cartActualAmount: e.target.value})} className="h-8 text-xs font-mono font-bold bg-blue-50/20 text-[#142E88]" />
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsAdvanceModalOpen(false)} className="flex-1 h-8 rounded-none text-xs cursor-pointer">Cancel</Button>
                <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-8 text-xs cursor-pointer">Update Envelope</Button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}