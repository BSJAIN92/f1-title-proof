# Frozen 2026 Formula 1 data

This directory is the proposed V1 freeze at **2026-09-01 21:14:22 IST (UTC+05:30)**.

The product owner approved this snapshot at **2026-09-01 21:49:05 IST (UTC+05:30)** after the verification checks passed.

## Files

- `manifest.json`: cutoff, decisions, standings, future lineup, remaining sessions, rules, exclusions, sources, and approval state.
- `session-results.json`: all 12 completed race and 5 completed Sprint classifications, totaling 374 rows, extracted from FINAL FIA documents.
- `countback.json`: all 12 race-finish countback tables and all 12 FINAL qualifying fallback classifications.
- `source-documents.json`: retrieval record and content checksum for all 36 official source documents and pages.
- `classified-retirement-fixture.json`: clearly labeled test-only scoring fixture allowed by the product decision.

## Important boundaries

- Yuki Tsunoda remains in completed Dutch Grand Prix data as a season participant, but is not in the regular future 22-driver lineup.
- Liam Lawson's Dutch points belong to Red Bull; event-specific constructor entries control completed results.
- The revised 23-race calendar is frozen, including the Bahrain Grand Prix at Sepang and the Saudi Arabian cancellation.
- Sprint results contribute points but never championship countback positions.
- Monaco uses the revised FINAL race classification, FIA Document 100.

## Verification

From the repository root, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File data/frozen/2026-09-01/validate.ps1
```

Expected final line:

```text
PASS: frozen dataset is internally consistent and matches the stored standings totals.
```
