import test from "node:test";
import assert from "node:assert/strict";
import { formatItemNumber, formatReportNumber, legacyReportNumber } from "./field-observation-utils";

test("formats sequential report and child item numbers", () => {
  assert.equal(formatReportNumber(1001), "FOR-1001");
  assert.equal(formatItemNumber(1001, 1), "1001-1");
  assert.equal(formatItemNumber(1001, 12), "1001-12");
});

test("retains a deterministic display fallback for legacy observations", () => {
  assert.equal(legacyReportNumber("abc123456789"), "Legacy-abc12345");
});
