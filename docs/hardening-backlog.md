# Hardening Backlog

## 2028 Hardening — Permanent Firestore Authorization Model

This release intentionally does not change Firestore Security Rules. A dedicated follow-up must replace any temporary or time-limited authorization with permanent least-privilege rules before the current rule horizon.

Required acceptance criteria:

- Define authenticated role and project membership claims for read and write authorization.
- Restrict `counters/field_observations` allocation to the authenticated server API; clients must not write counters directly.
- Restrict RAID canonicalization and duplicate consolidation to authenticated server APIs.
- Preserve field-observation read access for legacy auto-ID documents and their existing subcollections/media.
- Add emulator tests for anonymous denial, cross-project denial, allowed project-member reads, privileged writes, counter protection, and RAID merge protection.
- Review Storage Rules separately so original evidence media remains authorized without exposing unrelated project files.
- Deploy rules through a reviewed, reversible release with an explicit rollback procedure and production access verification.
