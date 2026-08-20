import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRaidNumberingMapping,
  createProjectNameMap,
  formatRaidNumber,
  normalizeRaidProbability,
  raidCreatedAtMillis,
  resolveProjectName,
  resolveRaidOwnershipState,
} from "./raid-display-utils";

test("normalizes RAID probability to the supported 1-4 range", () => {
  const cases: Array<[unknown, number]> = [[0, 1], [1, 1], [2, 2], [3, 3], [4, 4], [5, 4], [7, 4], ["3", 3], [Number.NaN, 2], [null, 2]];
  for (const [value, expected] of cases) assert.equal(normalizeRaidProbability(value), expected);
});

test("resolves ownership without treating RAID classification as ROAM state", () => {
  assert.equal(resolveRaidOwnershipState({ roamCategory: "Risk", assignedOwner: "Unassigned" }), "New / Unassigned");
  assert.equal(resolveRaidOwnershipState({ roamCategory: "Risk", assignedOwner: "ITSD PM" }), "Owned");
  assert.equal(resolveRaidOwnershipState({ status: "Closed", assignedOwner: "ITSD PM" }), "Resolved");
  assert.equal(resolveRaidOwnershipState({ roamCategory: "Mitigated", assignedOwner: "Unassigned" }), "Mitigated");
});

test("uses admin_projects names before legacy names and project IDs", () => {
  const names = createProjectNameMap([{ id: "33-03349-09", name: "Terminal C Parking Garage (TCPG)" }]);
  assert.equal(resolveProjectName("33-03349-09", names, "Old Name"), "Terminal C Parking Garage (TCPG)");
  assert.equal(resolveProjectName("P2", names, "Legacy Name"), "Legacy Name");
  assert.equal(resolveProjectName("P3", names), "P3");
});

test("formats deterministic RAID business numbers and creation ordering values", () => {
  assert.equal(formatRaidNumber(1001), "RAID-1001");
  assert.equal(raidCreatedAtMillis("2026-08-05T00:00:00.000Z"), Date.parse("2026-08-05T00:00:00.000Z"));
  assert.equal(raidCreatedAtMillis(null), Number.POSITIVE_INFINITY);
});

test("numbers only active canonicals by creation date with document ID tie-breaking", () => {
  assert.deepEqual(buildRaidNumberingMapping([
    { id: "B", data: { createdAt: "2026-01-01" } },
    { id: "MERGED", data: { createdAt: "2025-01-01", mergeStatus: "MERGED" } },
    { id: "A", data: { createdAt: "2026-01-01" } },
  ]), [
    { firestoreDocumentId: "A", raidSequence: 1001, raidNumber: "RAID-1001" },
    { firestoreDocumentId: "B", raidSequence: 1002, raidNumber: "RAID-1002" },
  ]);
});
