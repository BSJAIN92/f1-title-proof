# Visitor Comparison Tracking Implementation Plan

> **For agentic workers:** Implement each checked step in order and verify each boundary before moving on.

**Goal:** Restore anonymous Convex tracking for the active head-to-head flow and show each browser its recent comparisons.

**Architecture:** The Next.js API remains the only caller allowed to write analytics. Convex stores a compact event stream for private analysis and a separate comparison-history record for browser-visible reopening; the browser identity remains a random, HTTP-only cookie represented in Convex only by its SHA-256 hash.

**Tech Stack:** Next.js 16, React 19, TypeScript, Convex, Vitest, Playwright

**Spec:** User-approved fixes from the 2026-09-10 diagnosis.

## Global Constraints

- Do not collect names, email addresses, IP addresses, exact locations, or device fingerprints.
- Analytics failure must not replace a successful comparison result with an error.
- Keep all Convex credentials server-only.
- Preserve existing calculation-history data and routes.

---

### Task 1: Convex comparison storage

**Files:** `convex/schema.ts`, `convex/history.ts`, `src/convex/contracts.ts`

- [x] Add validated visitor-event and comparison-history tables and indexes.
- [x] Add credential-protected mutations for visits and comparison outcomes.
- [x] Return the newest 20 comparison records for one visitor.
- [x] Add strict browser-boundary parsing tests.

### Task 2: Active API tracking

**Files:** `src/server/convex-store.ts`, `app/api/compare/route.ts`, `app/api/state/route.ts`

- [x] Record a visit when anonymous state is requested.
- [x] Record successful and rejected comparisons without exposing the cookie value.
- [x] Keep a completed comparison usable if its analytics write fails.
- [x] Cover the active bridge with unit tests.

### Task 3: Browser-visible comparison history

**Files:** `src/components/scenario-workbench.tsx`, `src/components/calculation-history.tsx`, `app/globals.css`

- [x] Load state once when the workbench mounts.
- [x] Refresh history after a completed comparison.
- [x] Reopen a comparison by rerunning the stored pair against its stored version.
- [x] Preserve loading, empty, unavailable, retry, desktop, and mobile states.

### Task 4: Verification and configuration guidance

**Files:** `.env.example`, tests as needed

- [x] Verify unit tests, lint, production build, and deployment source checks.
- [x] Verify desktop and mobile behavior in a browser when a configured Convex deployment is available.
- [x] Report that `CONVEX_SERVER_CREDENTIAL` must match in Vercel and Convex; do not invent or commit a credential.
