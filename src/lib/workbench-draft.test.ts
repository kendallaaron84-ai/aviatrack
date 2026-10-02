import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWorkbenchSavePayload,
  emptyWorkbenchReportForm,
  isLocalWorkbenchDraftNewer,
  parseLocalWorkbenchDraft,
  sanitizeForFirestore,
  workbenchLocalDraftKey,
  workbenchStateSignature,
} from "./workbench-draft";

const state = {
  milestones: [{ id: "M1", baselineStart: "2026-01-01", baselineEnd: "2026-01-10", forecastEnd: "2026-01-12", staleRaidReference: undefined }],
  dependencies: [{ id: "D1", optional: undefined }],
  evm: { plannedValue: 100, earnedValue: 50, actualCost: 40 },
  reportForm: { ...emptyWorkbenchReportForm(), lookAhead: "Current unsaved PM narrative" },
};

test("uses a project-scoped local recovery key", () => {
  assert.equal(workbenchLocalDraftKey("P-100"), "aviatrack_workbench_draft_P-100");
});

test("accepts only a valid draft for the selected project", () => {
  const serialized = JSON.stringify({ version: 1, projectId: "P1", savedAt: "2026-10-02T12:00:00.000Z", state });
  assert.equal(parseLocalWorkbenchDraft(serialized, "P2"), null);
  assert.equal(parseLocalWorkbenchDraft(serialized, "P1")?.state.reportForm.lookAhead, "Current unsaved PM narrative");
});

test("offers recovery only when the local draft is newer", () => {
  const local = parseLocalWorkbenchDraft(JSON.stringify({ version: 1, projectId: "P1", savedAt: "2026-10-02T12:00:00.000Z", state }), "P1")!;
  assert.equal(isLocalWorkbenchDraftNewer(local, "2026-10-02T11:59:59.000Z"), true);
  assert.equal(isLocalWorkbenchDraftNewer(local, "2026-10-02T12:00:01.000Z"), false);
});

test("removes undefined RAID-derived or optional values before Firestore persistence", () => {
  assert.deepEqual(sanitizeForFirestore({ keep: 1, drop: undefined, nested: { drop: undefined }, array: [1, undefined] }), {
    keep: 1,
    nested: {},
    array: [1, null],
  });
});

test("persists the report draft and coherent final state without undefined values", () => {
  const payload = buildWorkbenchSavePayload({ projectId: "P1", state, savedBy: "pm@example.com", savedAt: "2026-10-02T12:00:00.000Z" });
  assert.equal(payload.reportDraft.form.lookAhead, "Current unsaved PM narrative");
  assert.equal(payload.milestones[0].varianceDays, 2);
  assert.equal("staleRaidReference" in payload.milestones[0], false);
  assert.equal("optional" in payload.dependencies[0], false);
});

test("rapid edits produce distinct signatures so only the final state is acknowledged", () => {
  const first = workbenchStateSignature(state);
  const final = workbenchStateSignature({ ...state, reportForm: { ...state.reportForm, lookAhead: "Final coherent edit" } });
  assert.notEqual(first, final);
});
