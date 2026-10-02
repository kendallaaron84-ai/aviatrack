import { durationDays, varianceDays } from "./date-utils";

export type WorkbenchReportForm = {
  periodStart: string;
  periodEnd: string;
  lookAhead: string;
  risks: string;
  impact: string;
  resolutionPlan: string;
  actionItems: string;
};

export type WorkbenchDraftState = {
  milestones: Array<Record<string, any>>;
  dependencies: Array<Record<string, any>>;
  evm: { plannedValue: number; earnedValue: number; actualCost: number };
  reportForm: WorkbenchReportForm;
};

export type LocalWorkbenchDraft = {
  version: 1;
  projectId: string;
  savedAt: string;
  state: WorkbenchDraftState;
};

export const WORKBENCH_AUTOSAVE_DELAY_MS = 1500;

export function emptyWorkbenchReportForm(): WorkbenchReportForm {
  return { periodStart: "", periodEnd: "", lookAhead: "", risks: "", impact: "", resolutionPlan: "", actionItems: "" };
}

export function normalizeWorkbenchReportForm(value: unknown): WorkbenchReportForm {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const empty = emptyWorkbenchReportForm();
  return Object.fromEntries(Object.keys(empty).map(key => [key, typeof source[key] === "string" ? source[key] : ""])) as WorkbenchReportForm;
}

export function workbenchLocalDraftKey(projectId: string): string {
  return `aviatrack_workbench_draft_${projectId}`;
}

export function workbenchStateSignature(state: WorkbenchDraftState): string {
  return JSON.stringify(state);
}

export function parseLocalWorkbenchDraft(serialized: string | null, expectedProjectId: string): LocalWorkbenchDraft | null {
  if (!serialized) return null;
  try {
    const candidate = JSON.parse(serialized) as Partial<LocalWorkbenchDraft>;
    if (candidate.version !== 1 || candidate.projectId !== expectedProjectId || !candidate.savedAt || !candidate.state) return null;
    if (!Array.isArray(candidate.state.milestones) || !Array.isArray(candidate.state.dependencies)) return null;
    const evm = candidate.state.evm;
    if (!evm || ![evm.plannedValue, evm.earnedValue, evm.actualCost].every(value => Number.isFinite(Number(value)))) return null;
    return {
      version: 1,
      projectId: expectedProjectId,
      savedAt: candidate.savedAt,
      state: {
        milestones: candidate.state.milestones,
        dependencies: candidate.state.dependencies,
        evm: {
          plannedValue: Number(evm.plannedValue),
          earnedValue: Number(evm.earnedValue),
          actualCost: Number(evm.actualCost),
        },
        reportForm: normalizeWorkbenchReportForm(candidate.state.reportForm),
      },
    };
  } catch {
    return null;
  }
}

export function isLocalWorkbenchDraftNewer(localDraft: LocalWorkbenchDraft, serverSavedAt: unknown): boolean {
  const localMillis = Date.parse(localDraft.savedAt);
  const serverMillis = typeof serverSavedAt === "string" ? Date.parse(serverSavedAt) : Number.NaN;
  return Number.isFinite(localMillis) && (!Number.isFinite(serverMillis) || localMillis > serverMillis);
}

export function sanitizeForFirestore<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => item === undefined ? null : sanitizeForFirestore(item)) as T;
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, sanitizeForFirestore(item)]),
    ) as T;
  }
  return value;
}

export function buildWorkbenchSavePayload(input: {
  projectId: string;
  state: WorkbenchDraftState;
  savedBy: string;
  savedAt: string;
}) {
  const plannedValue = Number(input.state.evm.plannedValue) || 0;
  const earnedValue = Number(input.state.evm.earnedValue) || 0;
  const actualCost = Number(input.state.evm.actualCost) || 0;
  const spi = plannedValue > 0 ? earnedValue / plannedValue : 0;
  const processedMilestones = input.state.milestones.map(milestone => {
    const baselineStart = milestone.baselineStart || milestone.baselineStartDate || "";
    const baselineEnd = milestone.baselineEnd || milestone.baselineEndDate || "";
    const forecastEnd = milestone.forecastEnd || milestone.forecastEndDate || "";
    const baselineDuration = durationDays(baselineStart, baselineEnd);
    return {
      ...milestone,
      baselineDurationDays: baselineDuration,
      estimatedDurationDays: baselineDuration === null || baselineDuration === 0 || spi <= 0
        ? baselineDuration
        : Number((baselineDuration / spi).toFixed(1)),
      varianceDays: varianceDays(baselineEnd, forecastEnd),
    };
  });
  const hasCriticalPathBlocker = input.state.milestones.some(milestone => milestone.criticalPathStatus === "🔴 Critical Path Blocked");
  const statusHealthIndicator = earnedValue - actualCost < 0 || hasCriticalPathBlocker || spi < 1 ? "Critical Risk" : "On Track";

  return sanitizeForFirestore({
    projectId: input.projectId,
    milestones: processedMilestones,
    dependencies: input.state.dependencies,
    evm: { plannedValue, earnedValue, actualCost },
    reportDraft: {
      form: normalizeWorkbenchReportForm(input.state.reportForm),
      lastSavedBy: input.savedBy,
      lastSavedAt: input.savedAt,
      version: 1,
    },
    statusHealthIndicator,
    lastSavedBy: input.savedBy,
    lastSavedAt: input.savedAt,
  });
}
