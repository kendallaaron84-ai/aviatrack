import assert from "node:assert/strict";
import test from "node:test";
import { formatVarianceDays, normalizeDate, varianceDays } from "./date-utils";
import { buildSparseEvmSeries, calculateEvm, resolveReportingCutoff } from "./evm-utils";

test("normalizes supported date representations and rejects corrupt dates", () => {
  const expected = "2025-01-02";
  const timestamp = { toDate: () => new Date("2025-01-02T00:00:00Z") };
  const shaped = { seconds: 1735776000, nanoseconds: 0 };
  for (const value of [timestamp, shaped, "2025-01-02", "2025-01-02T00:00:00Z", 1735776000, 1735776000000]) {
    assert.equal(normalizeDate(value)?.toISOString().slice(0, 10), expected);
  }
  for (const value of [null, undefined, "", "not-a-date", Number.NaN, Number.POSITIVE_INFINITY, 0, "1970-01-01"]) {
    assert.equal(normalizeDate(value), null);
  }
});

test("keeps milestone variances independent", () => {
  assert.equal(formatVarianceDays(varianceDays("2025-01-01", "2026-02-13")), "+408 Days");
  assert.equal(formatVarianceDays(varianceDays("2025-06-01", "2025-06-15")), "+14 Days");
  assert.equal(formatVarianceDays(varianceDays("2025-06-15", "2025-06-05")), "-10 Days");
  assert.equal(formatVarianceDays(varianceDays("1970-01-01", "2025-06-05")), "N/A");
});

test("calculates to-date EVM without fabricated values", () => {
  assert.deepEqual(calculateEvm({ plannedValue: 4_000_000, earnedValue: 3_600_000, actualCost: 4_200_000 }), {
    plannedValue: 4_000_000,
    earnedValue: 3_600_000,
    actualCost: 4_200_000,
    costVariance: -600_000,
    scheduleVariance: -400_000,
    cpi: 3_600_000 / 4_200_000,
    spi: 0.9,
  });
});

test("resolves cutoff and leaves future AC/EV null", () => {
  const records = [{ projectId: "P1", periodEnd: "2026-06-30", evmMetrics: { actualCost: 20, earnedValue: 18 } }];
  const cutoff = resolveReportingCutoff(records, "2026-06-15");
  assert.equal(cutoff.toISOString().slice(0, 10), "2026-06-30");
  assert.deepEqual(buildSparseEvmSeries([
    { periodDate: "2026-06-30", plannedValue: 25 },
    { periodDate: "2027-06-30", plannedValue: 100 },
  ], records, cutoff), [
    { periodDate: "2026-06-30", Planned: 25, Actual: 20, Earned: 18 },
    { periodDate: "2027-06-30", Planned: 100, Actual: null, Earned: null },
  ]);
});

test("does not carry AC/EV into a date without an exact snapshot", () => {
  const records = [{ projectId: "P1", periodEnd: "2026-06-30", evmMetrics: { actualCost: 20, earnedValue: 18 } }];
  assert.deepEqual(buildSparseEvmSeries([
    { periodDate: "2026-06-30", plannedValue: 25 },
    { periodDate: "2026-07-31", plannedValue: 30 },
  ], records, new Date("2026-07-31T00:00:00Z")), [
    { periodDate: "2026-06-30", Planned: 25, Actual: 20, Earned: 18 },
    { periodDate: "2026-07-31", Planned: 30, Actual: null, Earned: null },
  ]);
});
