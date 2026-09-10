# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the activity-dashboard security audit findings without weakening the public app.

**Architecture:** Apply defense in depth at three boundaries: secure browser responses, throttle public server routes before expensive work, and replace raw dashboard scans with compact daily aggregates. Keep secrets server-only and rotate the session signer after deployment.

**Tech Stack:** Next.js 16, Convex 1.45, Node crypto, TypeScript, Vitest.

**Spec:** Security audit returned in this conversation on 2026-09-10.

## Global Constraints

- Do not disclose the replacement dashboard password in chat, source, logs, or Git history.
- Analytics failures must not break normal product use.
- Do not store raw IP addresses; rate-limit keys must be keyed hashes.
- Private and visitor-specific responses must be explicitly non-cacheable.
- Existing historical dashboard data must remain visible after aggregation migration.

---

### Task 1: Browser and private-response protections

**Files:** Modify `next.config.ts`, dashboard auth routes, and cookie-bound API routes; test response headers.

- [ ] Add CSP, clickjacking, content-type, referrer, and permissions headers.
- [ ] Add `private, no-store` to dashboard, login, and cookie-bound API responses.
- [ ] Shorten anonymous identity and dashboard session lifetimes.
- [ ] Run focused tests, lint, and build.

### Task 2: Login and public-route abuse controls

**Files:** Create `convex/security.ts` and `src/server/rate-limit.ts`; modify schema and public API routes; add unit tests.

- [ ] Hash the edge-provided client address with a server secret; never store the address.
- [ ] Add fixed-window limits for login, visits, comparisons, calculation, and comparison-return traffic.
- [ ] Return 429 with `Retry-After` for product requests; silently discard rate-limited best-effort analytics.
- [ ] Add visit deduplication by visitor and time bucket.

### Task 3: Bounded analytics storage and retention

**Files:** Modify analytics schema/history/dashboard functions and add a protected retention endpoint.

- [ ] Maintain daily visitor, country, comparison, matchup, completion, and failure aggregates during writes.
- [ ] Backfill current historical events once before switching reads.
- [ ] Query daily aggregates instead of raw event rows.
- [ ] Purge raw activity, history, expired rate buckets, and stale aggregate rows after the documented retention period.

### Task 4: Verification and deployment

**Files:** Update `.env.example`, README, and deployment checks.

- [ ] Run all tests, lint, build, and dependency audit.
- [ ] Push reviewed commits to GitHub.
- [ ] Configure hidden rate-limit and retention secrets in Vercel.
- [ ] Rotate `DASHBOARD_SESSION_SECRET`, deploy Vercel and Convex, and verify live headers, throttling, login, dashboard, public app, and old-domain 404.
- [ ] Tell the user how to replace `DASHBOARD_PASSWORD` and note that their change requires a redeploy.

## Self-review

- Coverage: every high, medium, low, and warning item has an implementation or an explicit operational step.
- Placeholder scan: no deferred code placeholders.
- Type consistency: rate-limit decisions and daily aggregate records have one shared server contract.
