import { extractReportingPeriodEnd, latestValidDate, normalizeDate, type DateLike } from "./date-utils";

export interface EvmValues {
  plannedValue: number;
  earnedValue: number;
  actualCost: number;
}

export interface ReportingRecord {
  projectId?: string;
  periodEnd?: DateLike;
  reportPeriod?: string;
  reportingPeriod?: string;
  createdAt?: DateLike;
  timestamp?: DateLike;
  evmMetrics?: Partial<EvmValues>;
}

const finiteAmount = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

export function calculateEvm(values: Partial<EvmValues>) {
  const plannedValue = finiteAmount(values.plannedValue);
  const earnedValue = finiteAmount(values.earnedValue);
  const actualCost = finiteAmount(values.actualCost);
  return {
    plannedValue,
    earnedValue,
    actualCost,
    costVariance: earnedValue - actualCost,
    scheduleVariance: earnedValue - plannedValue,
    cpi: actualCost > 0 ? earnedValue / actualCost : null,
    spi: plannedValue > 0 ? earnedValue / plannedValue : null,
  };
}

export function resolveReportingCutoff(
  records: ReportingRecord[],
  lastSavedAt?: DateLike,
  fallback = new Date(),
): Date {
  const periodEnds = records.map(record =>
    normalizeDate(record.periodEnd) ||
    extractReportingPeriodEnd(record.reportPeriod || record.reportingPeriod),
  );
  return latestValidDate(periodEnds)
    || latestValidDate(records.flatMap(record => [record.createdAt, record.timestamp]))
    || normalizeDate(lastSavedAt)
    || normalizeDate(fallback)
    || new Date();
}

export function buildSparseEvmSeries(
  plannedPoints: Array<{ periodDate: DateLike; plannedValue: number }>,
  records: ReportingRecord[],
  cutoff: Date,
) {
  const actualByDate = new Map<string, Partial<EvmValues>>();
  for (const record of records) {
    const date = normalizeDate(record.periodEnd)
      || extractReportingPeriodEnd(record.reportPeriod || record.reportingPeriod)
      || normalizeDate(record.createdAt)
      || normalizeDate(record.timestamp);
    if (date && date <= cutoff && record.evmMetrics) {
      actualByDate.set(date.toISOString().slice(0, 10), record.evmMetrics);
    }
  }

  return plannedPoints.map(point => {
    const date = normalizeDate(point.periodDate);
    const key = date?.toISOString().slice(0, 10) || "";
    const actual = actualByDate.get(key);
    return {
      periodDate: key,
      Planned: finiteAmount(point.plannedValue),
      Actual: date && date <= cutoff && actual ? finiteAmount(actual.actualCost) : null,
      Earned: date && date <= cutoff && actual ? finiteAmount(actual.earnedValue) : null,
    };
  });
}
