import type { Project } from './types';
import { placeholderImages } from './placeholder-images.json';

const today = new Date();
const daysAgo = (days: number) => new Date(today.getTime() - days * 24 * 60 * 60 * 1000).getTime();

export const mockProjects: Project[] = [
  {
    id: 'proj-001',
    name: 'Terminal 4 Wi-Fi Upgrade',
    wbs: 'A-385-22-T4-WIFI',
    glCode: '6100.510.8500',
    deliveryMethod: 'CMAR',
    itDisciplines: ['Networking', 'Cabling'],
    phaseSnapshots: [
      { phase: '30% CD', costEstimate: 1200000, isLocked: true, date: daysAgo(90) },
      { phase: '60% CD', costEstimate: 1450000, isLocked: true, date: daysAgo(60) },
      { phase: '90% CD', costEstimate: 1550000, isLocked: true, date: daysAgo(30) },
      { phase: '100% CD', costEstimate: 1600000, isLocked: false },
    ],
    purchaseOrders: [
      { id: 'po-1', item: 'Access Points', vendor: 'Cisco', amount: 750000, date: daysAgo(25) },
      { id: 'po-2', item: 'Structured Cabling', vendor: 'Corning', amount: 600000, date: daysAgo(20) },
    ],
    invoices: [
      { id: 'inv-1', poId: 'po-1', invoiceNumber: 'INV-CIS-001', amount: 750000, date: daysAgo(15), documentName: 'cisco_invoice.pdf' },
    ],
    changeOrders: [
      { id: 'co-1', description: 'Additional coverage for new gate area', cost: 50000, date: daysAgo(10) },
    ],
    testPlans: [{ id: 'tp-1', name: 'Wi-Fi Acceptance Test Plan', date: daysAgo(5), documentName: 'wifi_atp.pdf' }],
    gcWallCloseDate: new Date(today.getFullYear(), today.getMonth() + 1, 15).getTime(),
    itMobilizationDate: new Date(today.getFullYear(), today.getMonth() + 1, 10).getTime(),
    workStarted: false,
    imageUrl: placeholderImages[0].imageUrl,
    imageHint: placeholderImages[0].imageHint,
  },
  {
    id: 'proj-002',
    name: 'Concourse B Security Cameras',
    wbs: 'A-412-23-CB-SEC',
    glCode: '6100.520.8600',
    deliveryMethod: 'DB',
    itDisciplines: ['Security Systems', 'Networking'],
    phaseSnapshots: [
      { phase: '30% CD', costEstimate: 2500000, isLocked: true, date: daysAgo(120) },
      { phase: '60% CD', costEstimate: 2800000, isLocked: true, date: daysAgo(80) },
      { phase: '90% CD', costEstimate: 2800000, isLocked: false },
      { phase: '100% CD', costEstimate: 0, isLocked: false },
    ],
    purchaseOrders: [
       { id: 'po-3', item: 'IP Cameras', vendor: 'Axis', amount: 1200000, date: daysAgo(75) },
       { id: 'po-4', item: 'VMS Servers', vendor: 'Dell', amount: 800000, date: daysAgo(70) },
    ],
    invoices: [
        { id: 'inv-2', poId: 'po-3', invoiceNumber: 'INV-AX-001', amount: 1200000, date: daysAgo(60) },
        { id: 'inv-3', poId: 'po-4', invoiceNumber: 'INV-DELL-001', amount: 800000, date: daysAgo(55) },
    ],
    changeOrders: [],
    testPlans: [],
    gcWallCloseDate: new Date(today.getFullYear(), today.getMonth() + 2, 20).getTime(),
    itMobilizationDate: new Date(today.getFullYear(), today.getMonth() + 2, 25).getTime(),
    workStarted: true,
    workStartDate: daysAgo(15),
    imageUrl: placeholderImages[1].imageUrl,
    imageHint: placeholderImages[1].imageHint,
  },
  {
    id: 'proj-003',
    name: 'New International Terminal AV',
    wbs: 'A-299-21-NIT-AV',
    glCode: '6100.530.8700',
    deliveryMethod: 'DBB',
    itDisciplines: ['Audiovisual', 'Networking'],
    phaseSnapshots: [
      { phase: '30% CD', costEstimate: 5000000, isLocked: true, date: daysAgo(200) },
      { phase: '60% CD', costEstimate: 5500000, isLocked: false },
      { phase: '90% CD', costEstimate: 0, isLocked: false },
      { phase: '100% CD', costEstimate: 0, isLocked: false },
    ],
    purchaseOrders: [],
    invoices: [],
    changeOrders: [],
    testPlans: [],
    workStarted: false,
    imageUrl: placeholderImages[2].imageUrl,
    imageHint: placeholderImages[2].imageHint,
  },
];
