import assert from "node:assert/strict";
import test from "node:test";
import { chooseRaidDuplicateMatches } from "./raid-dedup-utils";

test("matches only active same-project high-confidence RAID duplicates", () => {
  const result = chooseRaidDuplicateMatches([
    { id: "canonical", data: { projectId: "P1", title: "Water intrusion", description: "Electrical room", createdAt: "2026-01-01" } },
    { id: "duplicate", data: { projectId: "P1", title: "Water intrusion", description: "Electrical room", createdAt: "2026-02-01" } },
    { id: "other-project", data: { projectId: "P2", title: "Water intrusion", description: "Electrical room" } },
    { id: "closed", data: { projectId: "P1", title: "Water intrusion", description: "Electrical room", status: "Resolved" } },
  ]);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].canonical.id, "canonical");
  assert.equal(result.matches[0].duplicate.id, "duplicate");
  assert.equal(result.ambiguous.length, 0);
});
