import assert from "node:assert/strict";
import test from "node:test";
import { evidenceStoragePath, evidenceSummary, isNonEmptyEvidence, storagePathFromDownloadUrl } from "./evidence-integrity";

test("rejects zero-byte evidence before upload", () => {
  assert.equal(isNonEmptyEvidence({ size: 0 }), false);
  assert.equal(isNonEmptyEvidence({ size: 1 }), true);
});

test("creates stable evidence paths while preserving retry attempts", () => {
  assert.equal(
    evidenceStoragePath("parent", "observation", "evidence", "IMG_1001.JPG", 1),
    "field_evidence/parent-observation-evidence.jpg",
  );
  assert.equal(
    evidenceStoragePath("parent", "observation", "evidence", "IMG_1001.JPG", 3),
    "field_evidence/parent-observation-evidence-retry-3.jpg",
  );
});

test("extracts Storage paths from legacy Firebase download URLs", () => {
  assert.equal(
    storagePathFromDownloadUrl("https://firebasestorage.googleapis.com/v0/b/bucket/o/field_evidence%2Fframe.jpg?alt=media&token=secret"),
    "field_evidence/frame.jpg",
  );
  assert.equal(storagePathFromDownloadUrl("not-a-url"), null);
});

test("summarizes verified and failed evidence", () => {
  assert.deepEqual(evidenceSummary(["VERIFIED", "FAILED", "STAGED"]), {
    total: 3,
    verified: 1,
    failed: 1,
    complete: false,
  });
});

