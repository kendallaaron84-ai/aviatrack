export type PortfolioDateValue = string | Date | { seconds?: number; toDate?: () => Date } | null;

export interface EVMData {
  plannedValue: number;
  earnedValue: number;
  actualCost: number;
  costVariance?: number;
  scheduleVariance?: number;
  cpi?: number;
  spi?: number;
}

export interface Project {
  id: string;
  projectId?: string;
  name: string;
  projectName?: string;
  program?: string;
  track?: string;
  category?: string;
  budget?: number;
  wbs?: string;
  isUnplannedInjection?: boolean;
  weeklySummaryText?: string;
}

export interface Milestone {
  id?: string;
  projectId: string;
  name?: string;
  tradeMilestone?: string;
  status?: string;
  type?: string;
  level?: string;
  workArea?: string;
  specificRoom?: string;
  deliveryTrack?: string;
  deliveryVehicle?: string;
  showOnDashboard?: boolean;
  baselineStart?: string;
  baselineStartDate?: string;
  baselineEnd?: string;
  baselineEndDate?: string;
  forecastStart?: string;
  forecastStartDate?: string;
  forecastEnd?: string;
  forecastEndDate?: string;
  actualEnd?: string;
  actualEndDate?: string;
  spatialHierarchyTags?: { level?: string };
}

export interface Dependency {
  id?: string;
  projectId: string;
  linkedMilestone?: string;
  targetEntity?: string;
  activityTask?: string;
  status?: string;
  type?: string;
  tradeDivision?: string;
  sector?: string;
}

export interface RollupState {
  id: string;
  projectId?: string;
  projectName?: string;
  program?: string;
  budget?: number;
  budgetAllocation?: number;
  evm?: Partial<EVMData>;
  evmMetrics?: Partial<EVMData>;
  milestones?: Milestone[];
  dependencies?: Dependency[];
  cpi?: number;
  spi?: number;
  costVariance?: number;
  scheduleVariance?: number;
  statusHealthIndicator?: string;
  criticalBlockersCount?: number;
  totalSlippageDays?: number;
  lastSavedBy?: string;
  lastSavedAt?: PortfolioDateValue;
  lastSignOffBy?: string;
  lastSignOffAt?: PortfolioDateValue;
  latestPeriod?: string;
  currentRisksText?: string;
  mitigationPlanText?: string;
}

export interface RAIDItem {
  id: string;
  projectId?: string;
  project?: string;
  projectName?: string;
  title?: string;
  description?: string;
  threat?: string;
  classification?: string;
  roamCategory?: string;
  status?: string;
  importance?: string;
  impact?: string;
  impactLevel?: string;
  spec?: string;
  probability?: number;
  assignedOwner?: string;
  submittedAt?: string;
}

export interface StatusReport {
  id: string;
  projectId?: string;
  projectName?: string;
  reportPeriod?: string;
  reportingPeriod?: string;
  submittedBy?: string;
  loggedBy?: string;
  createdAt?: PortfolioDateValue;
  timestamp?: PortfolioDateValue;
  spi?: number;
  cpi?: number;
  evmMetrics?: Partial<EVMData>;
  lookAhead?: string;
  risks?: string;
  impact?: string;
  resolutionPlan?: string;
  actionItems?: string;
}
