"use client"
import * as React from "react"
import { notFound } from "next/navigation"
import { doc, collection } from "firebase/firestore"
import { useDoc, useCollection, useFirestore, useMemoFirebase, updateDocumentNonBlocking } from "@/firebase"
import type { Project, Financial, Dependency, ChangeOrder } from "@/lib/types"

import { PageHeader } from "@/components/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Building2, Clock, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useState, useEffect } from "react"

const formatCurrency = (amount: number, precision = 2) => {
    return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
    }).format(amount);
};

function FinancialsTable({ projectId }: { projectId: string }) {
    const firestore = useFirestore();
    const financialsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return collection(firestore, 'projects', projectId, 'financials');
    }, [firestore, projectId]);

    const { data: financials, isLoading } = useCollection<Financial>(financialsQuery);
    
    const [vendors, setVendors] = useState<Record<string, string>>({});
    const [elapsedTimes, setElapsedTimes] = useState<Record<string, string>>({});

    useEffect(() => {
        if (financials) {
            const initialVendors = financials.reduce((acc, fin) => {
                acc[fin.id] = fin.vendor || '';
                return acc;
            }, {} as Record<string, string>);
            setVendors(initialVendors);
        }
    }, [financials]);

    useEffect(() => {
        const interval = setInterval(() => {
            if (!financials) return;
            const newElapsedTimes: Record<string, string> = {};
            financials.forEach(fin => {
                if (fin.grStartTime && !fin.grEndTime) {
                    const start = new Date(fin.grStartTime).getTime();
                    const now = Date.now();
                    const diff = now - start;
                    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24).toString().padStart(2, '0');
                    const minutes = Math.floor((diff / (1000 * 60)) % 60).toString().padStart(2, '0');
                    const seconds = Math.floor((diff / 1000) % 60).toString().padStart(2, '0');
                    newElapsedTimes[fin.id] = `${days}d ${hours}:${minutes}:${seconds}`;
                } else if (fin.grStartTime && fin.grEndTime) {
                    const start = new Date(fin.grStartTime).getTime();
                    const end = new Date(fin.grEndTime).getTime();
                    const diff = end - start;
                    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
                    const minutes = Math.floor((diff / (1000 * 60)) % 60);
                    newElapsedTimes[fin.id] = `Total: ${days}d ${hours}h ${minutes}m`;
                } else {
                    newElapsedTimes[fin.id] = "Not Started";
                }
            });
            setElapsedTimes(newElapsedTimes);
        }, 1000);

        return () => clearInterval(interval);
    }, [financials]);


    const handleVendorChange = (id: string, value: string) => {
        setVendors(prev => ({...prev, [id]: value}));
    };

    const handleVendorBlur = (id: string) => {
        if (!firestore) return;
        const originalVendor = financials?.find(f => f.id === id)?.vendor || '';
        if (originalVendor !== vendors[id]) {
            const financialDocRef = doc(firestore, 'projects', projectId, 'financials', id);
            updateDocumentNonBlocking(financialDocRef, { vendor: vendors[id] });
        }
    };
    
    const handleStartGR = (id: string) => {
        if (!firestore) return;
        const financialDocRef = doc(firestore, 'projects', projectId, 'financials', id);
        updateDocumentNonBlocking(financialDocRef, { 
            grStartTime: new Date().toISOString(),
            grStatus: "In Transit / On-Site"
        });
    };

    const handleStopGR = (id: string) => {
        if (!firestore) return;
        const financialDocRef = doc(firestore, 'projects', projectId, 'financials', id);
        updateDocumentNonBlocking(financialDocRef, { 
            grEndTime: new Date().toISOString(), 
            grStatus: "Invoice Paid" 
        });
    };


    if (isLoading) return <Card><CardHeader><CardTitle>Financials</CardTitle></CardHeader><CardContent>Loading financials...</CardContent></Card>;
    if (!financials) return <Card><CardHeader><CardTitle>Financials</CardTitle></CardHeader><CardContent>No financial data available.</CardContent></Card>;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline text-[#142E88]">Financial Ledger</CardTitle>
                <CardDescription>Breakdown of project costs and procurement status.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Discipline</TableHead>
                            <TableHead>Item</TableHead>
                            <TableHead>Vendor</TableHead>
                            <TableHead className="text-right">Baseline</TableHead>
                            <TableHead className="text-right">Shopping Cart</TableHead>
                            <TableHead className="text-right">Variance</TableHead>
                            <TableHead className="text-center">GR Timer (Shame Clock)</TableHead>
                            <TableHead>Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {financials.map((fin) => {
                            const variance = fin.baseline - fin.shoppingCart;
                            return (
                                <TableRow key={fin.id}>
                                    <TableCell className="font-body">{fin.discipline}</TableCell>
                                    <TableCell className="font-body">{fin.item}</TableCell>
                                    <TableCell>
                                        <Input
                                            value={vendors[fin.id] || ''}
                                            onChange={(e) => handleVendorChange(fin.id, e.target.value)}
                                            onBlur={() => handleVendorBlur(fin.id)}
                                            placeholder="Enter Vendor"
                                            className="w-36 font-body"
                                        />
                                    </TableCell>
                                    <TableCell className="text-right font-mono">{formatCurrency(fin.baseline)}</TableCell>
                                    <TableCell className="text-right font-mono">{formatCurrency(fin.shoppingCart)}</TableCell>
                                    <TableCell
                                        className={cn(
                                            "text-right font-mono",
                                            variance < 0 ? "text-[#CE29CE] font-bold" : "text-green-600"
                                        )}
                                    >
                                        {formatCurrency(variance)}
                                    </TableCell>
                                    <TableCell className="font-mono text-center">
                                      <div className="flex flex-col items-center gap-1">
                                        <Badge variant={fin.grEndTime ? "secondary" : (fin.grStartTime ? "destructive" : "outline")}>
                                            {elapsedTimes[fin.id] || "..."}
                                        </Badge>
                                        <span className="text-[10px] text-muted-foreground uppercase">{fin.grStatus}</span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="flex gap-2">
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            onClick={() => handleStartGR(fin.id)} 
                                            disabled={!!fin.grStartTime}
                                            className="font-body text-xs"
                                        >
                                            <Clock className="mr-1 h-3 w-3" /> Equipment On-Site
                                        </Button>
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            onClick={() => handleStopGR(fin.id)} 
                                            disabled={!fin.grStartTime || !!fin.grEndTime}
                                            className="font-body text-xs"
                                        >
                                            <CheckCircle2 className="mr-1 h-3 w-3" /> GR’d
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}

export default function ProjectDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = React.use(params);
    const firestore = useFirestore();

    const projectRef = useMemoFirebase(() => {
        if (!firestore || !id) return null;
        return doc(firestore, "projects", id);
    }, [firestore, id]);

    const { data: project, isLoading } = useDoc<Project>(projectRef);
    
    const financialsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'projects', id, 'financials') : null, [firestore, id]);
    const { data: financials } = useCollection<Financial>(financialsQuery);

    const changeOrdersQuery = useMemoFirebase(() => firestore ? collection(firestore, 'projects', id, 'changeOrders') : null, [firestore, id]);
    const { data: changeOrders } = useCollection<ChangeOrder>(changeOrdersQuery);

    const [narrative, setNarrative] = useState("");

    useEffect(() => {
        if (project) {
            setNarrative(project.changeNarrative || "");
        }
    }, [project]);

    const handleNarrativeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setNarrative(e.target.value);
    };

    const handleNarrativeBlur = () => {
        if (projectRef && project && project.changeNarrative !== narrative) {
            updateDocumentNonBlocking(projectRef, { changeNarrative: narrative });
        }
    };

    if (isLoading) {
        return <div className="p-8 text-center font-body">Loading project details...</div>;
    }

    if (!project) {
        notFound();
    }

    const totalBudget = financials?.reduce((acc, fin) => acc + fin.baseline, 0) ?? 0;
    const totalShoppingCart = financials?.reduce((acc, fin) => acc + fin.shoppingCart, 0) ?? 0;
    const totalChangeOrders = changeOrders?.reduce((acc, co) => acc + co.amount, 0) ?? 0;
    const totalITCosts = totalShoppingCart + totalChangeOrders;
    const lockedEstimate = 510962.66;

    return (
        <div className="container mx-auto p-4 lg:p-8 space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="font-headline text-4xl text-[#142E88]">{project.name}</h1>
                    <p className="font-body text-muted-foreground">{project.wbs}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-body">{project.deliveryMethod}</Badge>
                    <Badge variant="outline" className="font-body">{project.status}</Badge>
                    <Building2 className="h-6 w-6 text-muted-foreground" />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border-l-4 border-l-[#142E88]">
                    <CardHeader className="pb-2">
                        <CardTitle className="font-headline text-sm text-muted-foreground uppercase tracking-wider">Total IT Budget</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold font-mono text-[#142E88]">{formatCurrency(totalBudget)}</p>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-[#CE29CE]">
                    <CardHeader className="pb-2">
                        <CardTitle className="font-headline text-sm text-muted-foreground uppercase tracking-wider">Total IT Costs</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold font-mono">{formatCurrency(totalITCosts)}</p>
                        <p className="text-xs text-muted-foreground mt-1">Actuals + Change Orders</p>
                    </CardContent>
                </Card>
                <Card className="bg-muted/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="font-headline text-sm text-muted-foreground uppercase tracking-wider">Project Estimate (100% CD)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <p className="text-3xl font-bold font-mono text-muted-foreground">{formatCurrency(lockedEstimate)}</p>
                            <Badge variant="outline" className="text-[10px]">LOCKED</Badge>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="font-headline text-[#142E88]">Change Narrative</CardTitle>
                    <CardDescription>Document reason for budget variances or scope changes.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Textarea
                        value={narrative}
                        onChange={handleNarrativeChange}
                        onBlur={handleNarrativeBlur}
                        placeholder="Enter project narrative here..."
                        className="min-h-[120px] font-body text-lg"
                    />
                </CardContent>
            </Card>

            <FinancialsTable projectId={project.id} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card>
                    <CardHeader>
                        <CardTitle className="font-headline text-[#142E88]">Dependencies</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Task</TableHead>
                                    <TableHead>GC Milestone</TableHead>
                                    <TableHead>IT Target</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {project.id === "GLF-2026-01" && (
                                    <TableRow>
                                        <TableCell className="font-body">Network Mobilization</TableCell>
                                        <TableCell className="font-body">2026-03-20</TableCell>
                                        <TableCell className="font-body">2026-03-21</TableCell>
                                        <TableCell><Badge variant="secondary">On Track</Badge></TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="font-headline text-[#142E88]">Change Orders</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>ID</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {changeOrders?.map(co => (
                                    <TableRow key={co.id}>
                                        <TableCell className="font-body">{co.id}</TableCell>
                                        <TableCell className="font-body">{co.description}</TableCell>
                                        <TableCell className="text-right font-mono text-[#CE29CE]">{formatCurrency(co.amount)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
            
            <div className="pt-8 flex justify-center">
                <Button variant="ghost" asChild>
                    <a href="/dashboard">Back to Dashboard</a>
                </Button>
            </div>
        </div>
    )
}
