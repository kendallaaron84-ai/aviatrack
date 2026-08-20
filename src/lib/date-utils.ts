export type DateLike =
  | string
  | number
  | Date
  | { seconds?: number; nanoseconds?: number; toDate?: () => Date }
  | null
  | undefined;

const MIN_VALID_YEAR = 1971;
const SECONDS_THRESHOLD = 100_000_000_000;

export function normalizeDate(value: DateLike): Date | null {
  if (value === null || value === undefined || value === "") return null;

  let date: Date;
  try {
    if (value instanceof Date) {
      date = new Date(value.getTime());
    } else if (typeof value === "number") {
      if (!Number.isFinite(value)) return null;
      date = new Date(Math.abs(value) < SECONDS_THRESHOLD ? value * 1000 : value);
    } else if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return null;
      if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
        const numeric = Number(trimmed);
        if (!Number.isFinite(numeric)) return null;
        date = new Date(Math.abs(numeric) < SECONDS_THRESHOLD ? numeric * 1000 : numeric);
      } else {
        date = new Date(trimmed);
      }
    } else if (typeof value.toDate === "function") {
      date = value.toDate();
    } else if (typeof value.seconds === "number" && Number.isFinite(value.seconds)) {
      date = new Date(value.seconds * 1000 + (value.nanoseconds || 0) / 1_000_000);
    } else {
      return null;
    }
  } catch {
    return null;
  }

  return Number.isFinite(date.getTime()) && date.getUTCFullYear() >= MIN_VALID_YEAR ? date : null;
}

export function varianceDays(baseline: DateLike, forecast: DateLike): number | null {
  const baselineDate = normalizeDate(baseline);
  const forecastDate = normalizeDate(forecast);
  if (!baselineDate || !forecastDate) return null;
  return Math.round((forecastDate.getTime() - baselineDate.getTime()) / 86_400_000);
}

export function durationDays(start: DateLike, end: DateLike): number | null {
  const result = varianceDays(start, end);
  return result === null ? null : Math.max(0, result);
}

export function formatVarianceDays(value: number | null): string {
  if (value === null) return "N/A";
  return `${value > 0 ? "+" : ""}${value} Days`;
}

export function latestValidDate(values: DateLike[]): Date | null {
  const dates = values.map(normalizeDate).filter((value): value is Date => value !== null);
  return dates.length ? new Date(Math.max(...dates.map(date => date.getTime()))) : null;
}

export function extractReportingPeriodEnd(value?: string): Date | null {
  if (!value) return null;
  const parts = value.split(/\s+to\s+/i);
  return normalizeDate(parts.length > 1 ? parts[parts.length - 1] : value);
}
