import assert from "node:assert/strict";
import test from "node:test";
import { gateRaidProposal, suppressThenDeleteRaid, type RaidAnalysis } from "./raid-governance";

const analysis: RaidAnalysis = {
  title: "Electrical room water intrusion",
  description: "Standing water is entering the electrical room and threatens energized distribution equipment.",
  classification: "Risk",
  importance: "Critical",
  probability: 3,
};

const base = {
  sourceKey: "FOR-1001-1",
  sourceText: "Standing water entered the electrical room and is approaching energized distribution equipment.",
  projectId: "P1",
  candidates: [],
  suppressions: [],
};

test("exact deleted source is suppressed before creation", () => {
  const result = gateRaidProposal({
    ...base,
    proposal: { action: "NEW_RAID", confidence: 0.99, rationale: "material", analysis },
    suppressions: [{ id: "S1", projectId: "P1", sourceKeys: ["FOR-1001-1"] }],
  });
  assert.equal(result.outcome, "SUPPRESSED");
});

test("different source describing the same suppressed condition is not recreated", () => {
  const result = gateRaidProposal({
    ...base,
    sourceKey: "JOURNAL_P1_NEW",
    proposal: { action: "NEW_RAID", confidence: 0.99, rationale: "material", analysis },
    suppressions: [{ id: "S1", projectId: "P1", normalizedRiskFingerprint: "electrical room water intrusion standing water is entering the electrical room and threatens energized distribution equipment" }],
  });
  assert.equal(result.outcome, "SUPPRESSED");
});

test("same-project duplicate becomes an evidence merge", () => {
  const result = gateRaidProposal({
    ...base,
    proposal: { action: "NEW_RAID", confidence: 0.99, rationale: "material", analysis },
    candidates: [{ id: "R1", projectId: "P1", title: analysis.title, description: analysis.description }],
  });
  assert.deepEqual(result, { outcome: "MERGE_EVIDENCE", candidateId: "R1", reason: "Deterministic same-project comparison matched an existing canonical RAID record." });
});

test("existing canonical source key is merged before trusting a NO_RAID proposal", () => {
  const result = gateRaidProposal({
    ...base,
    proposal: { action: "NO_RAID", confidence: 0.5, rationale: "model uncertainty" },
    candidates: [{ id: "R1", projectId: "P1", sourceKeys: ["FOR-1001-1"] }],
  });
  assert.equal(result.outcome, "MERGE_EVIDENCE");
});

test("vague observation is classified as NO_RAID", () => {
  const result = gateRaidProposal({
    ...base,
    sourceText: "Work continues.",
    proposal: { action: "NEW_RAID", confidence: 0.99, rationale: "uncertain", analysis },
  });
  assert.equal(result.outcome, "NO_RAID");
});

test("materially distinct and supported condition may become NEW_RAID", () => {
  const result = gateRaidProposal({ ...base, proposal: { action: "NEW_RAID", confidence: 0.95, rationale: "distinct supported condition", analysis } });
  assert.equal(result.outcome, "NEW_RAID");
});

test("similar wording in a different project is not incorrectly merged or suppressed", () => {
  const result = gateRaidProposal({
    ...base,
    proposal: { action: "NEW_RAID", confidence: 0.95, rationale: "distinct project", analysis },
    candidates: [{ id: "R2", projectId: "P2", title: analysis.title, description: analysis.description }],
    suppressions: [{ id: "S2", projectId: "P2", normalizedRiskFingerprint: `${analysis.title} ${analysis.description}` }],
  });
  assert.equal(result.outcome, "NEW_RAID");
});

test("suppression is verified before deletion", async () => {
  const order: string[] = [];
  await suppressThenDeleteRaid({
    persistSuppression: async () => { order.push("suppress"); },
    suppressionExists: async () => { order.push("verify-suppression"); return true; },
    deleteRaid: async () => { order.push("delete"); },
    raidExists: async () => { order.push("verify-delete"); return false; },
  });
  assert.deepEqual(order, ["suppress", "verify-suppression", "delete", "verify-delete"]);
});

test("failed suppression verification retains the RAID record", async () => {
  let deleted = false;
  await assert.rejects(() => suppressThenDeleteRaid({
    persistSuppression: async () => undefined,
    suppressionExists: async () => false,
    deleteRaid: async () => { deleted = true; },
    raidExists: async () => true,
  }), /retained/);
  assert.equal(deleted, false);
});
