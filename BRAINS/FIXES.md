# FIXES.md
# RACOS verified solution registry. FX IDs are ecosystem-wide (RC004). Empty at onboarding.
---
| ID | FIXES | SOLUTION | SESSION |
|----|-------|----------|---------|
| FX001 | RC001 | Replaced SearchableSelect's `fixed inset-0` click-catcher div with a `useRef` root + document `mousedown` listener that closes the dropdown only on genuinely-outside clicks, without ever rendering an element that covers the rest of the page. | SES006 |
| FX002 | RC002 | Migration 0009 recreates business_profile / custom_rates / bookings (SQLite requires table recreation to change a column's REFERENCES target), repointing the three affected columns at `municipalities(id)`. Verified by replaying all 9 migrations with `PRAGMA foreign_keys=ON` (matching the real runtime) and reproducing the exact failing save — confirmed it now succeeds. | SES006 |
| FX003 | RC003 | Added submitError/saveError React state + try/catch/finally + a red dismissible error banner to each of the three silent save handlers, plus a submitting/saving indicator on the button. Any DB error now surfaces its exact message in the UI instead of failing invisibly. | SES007 |
| FX004 | RC004 | Deleted the local racos.db file so migrations reapply cleanly against a fresh file — a checksum mismatch on an already-migrated db is unrecoverable short of that. Standing rule going forward: treat a shipped migration file as immutable; append a new migration instead of editing one that may already be applied. | SES007 |
