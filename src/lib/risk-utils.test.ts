import assert from "node:assert/strict";
import test from "node:test";
import { deterministicRaidId, fieldObservationSourceKey, journalSourceKey, normalizeRiskText, raidProjectLockId, riskSimilarity } from "./risk-utils";

test("creates authoritative stable source identities", () => {
  assert.equal(fieldObservationSourceKey("parent", "child", "FOR-1001", "1001-2"), "FOR-1001-2");
  assert.equal(fieldObservationSourceKey("parent", "child"), "FIELD_parent_child");
  assert.equal(journalSourceKey("P1", "J1"), "JOURNAL_P1_J1");
  assert.equal(deterministicRaidId("SOURCE"), deterministicRaidId("SOURCE"));
  assert.equal(raidProjectLockId("P1"), raidProjectLockId("P1"));
  assert.notEqual(raidProjectLockId("P1"), raidProjectLockId("P2"));
});

test("normalizes deterministic duplicate risk text conservatively", () => {
  assert.equal(normalizeRiskText(" Water-Intrusion! "), "water intrusion");
  assert.equal(riskSimilarity("Electrical room water intrusion", "Electrical room water intrusion"), 1);
  assert.ok(riskSimilarity("Electrical room water intrusion", "Schedule delay at gate") < 0.5);
});
