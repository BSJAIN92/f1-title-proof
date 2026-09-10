# Activity Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private activity dashboard with period filters, visitor geography, comparison popularity, and per-user usage metrics.

**Architecture:** Convex remains the source of truth for anonymous activity. A server-only dashboard query aggregates bounded event ranges, while a signed HTTP-only cookie protects the Next.js dashboard and its data endpoint. Country codes are captured from Vercel's request header without storing IP addresses.

**Tech Stack:** Next.js 16 App Router, React 19, Convex 1.45, TypeScript, Vitest, existing CSS design system.

**Spec:** User request in this conversation dated 2026-09-10.

## Global Constraints

- Dashboard access is private.
- Required filters are day, week, month, and custom date range.
- Required metrics are unique visitors, unique countries, popular driver comparisons, popular team comparisons, overall comparisons per user, and daily comparisons per user.
- Existing product activity must never fail because analytics recording fails.
- Store country codes only; do not store IP addresses.
- Historical country information before this release is unavailable and must be stated in the interface.

---

### Task 1: Analytics data contract and aggregation

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/dashboard.ts`
- Create: `src/analytics/dashboard-contract.ts`
- Test: `src/analytics/dashboard-contract.test.ts`

**Interfaces:**
- Consumes: `visitorEvents` rows and the existing server credential check.
- Produces: `DashboardSnapshot`, `parseDashboardRange(searchParams)`, and `api.dashboard.getSnapshot`.

- [ ] **Step 1: Write failing range and metric tests** covering day/week/month/custom UTC boundaries, invalid custom dates, canonical matchup ordering, unique visitor denominators, and empty results.
- [ ] **Step 2: Run `npx vitest run src/analytics/dashboard-contract.test.ts`** and verify the missing module causes failure.
- [ ] **Step 3: Implement the typed range parser and pure aggregation helpers**, using completed comparisons only and counting daily comparisons divided by that day's unique visitors.
- [ ] **Step 4: Add country storage and time-range indexes**, then add a credential-protected Convex query that returns only the requested bounded range.
- [ ] **Step 5: Run the focused test** and verify it passes.

### Task 2: Country capture and server data access

**Files:**
- Modify: `app/api/visit/route.ts`
- Modify: `src/server/convex-store.ts`
- Test: `src/server/convex-store.test.ts`

**Interfaces:**
- Consumes: Vercel's `x-vercel-ip-country` request header.
- Produces: `recordAnonymousVisit(visitorHash, countryCode?)` and `loadDashboardSnapshot(range)`.

- [ ] **Step 1: Extend the store test** to prove valid two-letter country codes are sent and malformed values are omitted.
- [ ] **Step 2: Run `npx vitest run src/server/convex-store.test.ts`** and verify it fails on the old signature.
- [ ] **Step 3: Pass the normalized country code from the visit route to Convex** without collecting an IP address.
- [ ] **Step 4: Add the server-only snapshot loader** and validate Convex's response before rendering.
- [ ] **Step 5: Run the focused test** and verify it passes.

### Task 3: Private dashboard authentication

**Files:**
- Create: `src/server/dashboard-auth.ts`
- Create: `src/server/dashboard-auth.test.ts`
- Create: `app/dashboard/login/page.tsx`
- Create: `app/api/dashboard/login/route.ts`
- Create: `app/api/dashboard/logout/route.ts`

**Interfaces:**
- Consumes: `DASHBOARD_PASSWORD` and `DASHBOARD_SESSION_SECRET` server environment variables.
- Produces: `isDashboardSessionValid(cookieValue)`, a login POST endpoint, and logout POST endpoint.

- [ ] **Step 1: Write failing tests** for constant-time password verification, signed session validation, expiry, and tampering.
- [ ] **Step 2: Run `npx vitest run src/server/dashboard-auth.test.ts`** and verify the module is missing.
- [ ] **Step 3: Implement HMAC-signed, seven-day sessions** in HTTP-only, secure, same-site cookies.
- [ ] **Step 4: Implement login and logout routes** with generic invalid-password errors and no password logging.
- [ ] **Step 5: Run the focused test** and verify it passes.

### Task 4: Pit-wall dashboard interface

**Files:**
- Create: `app/dashboard/page.tsx`
- Create: `src/components/activity-dashboard.tsx`
- Create: `src/components/dashboard-login.tsx`
- Modify: `app/globals.css`
- Test: `e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: `DashboardSnapshot`, preset/custom query parameters, and authenticated server session.
- Produces: responsive dashboard UI with period controls, metric summaries, daily activity chart, country list, and ranked matchup tables.

- [ ] **Step 1: Add an end-to-end test** for login rejection, successful protected access, preset filtering, custom dates, empty state, and logout.
- [ ] **Step 2: Build the server page** so unauthenticated requests redirect to `/dashboard/login` and authenticated requests fetch in parallel-ready server code.
- [ ] **Step 3: Build the filter and dashboard components** with accessible labels, tabular numbers, clear loading/empty/error states, and no chart dependency.
- [ ] **Step 4: Add dashboard styles** using the existing carbon palette, a timing-tower ranking pattern, a telemetry-strip daily chart, 4px spacing rhythm, and borders-only depth.
- [ ] **Step 5: Run lint, unit tests, and production build** and fix all failures.
- [ ] **Step 6: Run desktop and mobile browser checks** and fix overlap, unreadable states, keyboard focus, and custom-range behavior.

### Task 5: Deploy and verify

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Consumes: generated dashboard password and session secret.
- Produces: configured Vercel production environment, deployed Convex schema/functions, and a verified private production route.

- [ ] **Step 1: Document both required environment variables** without committing their values.
- [ ] **Step 2: Set the production secrets in Vercel** and retain the generated password for handoff.
- [ ] **Step 3: Push the reviewed commit to GitHub**.
- [ ] **Step 4: Deploy production through Vercel**, which also deploys the Convex schema and functions through the configured build command.
- [ ] **Step 5: Verify unauthenticated redirect, failed login, successful login, filtered data, logout, and the public app health** on `f1-championship-tracker.vercel.app`.

## Self-review

- Coverage: every requested metric and filter is assigned to Tasks 1 and 4; privacy, country capture, deployment, and recommended supporting metrics are assigned to Tasks 2–5.
- Placeholder scan: no deferred implementation items remain.
- Type consistency: `DashboardSnapshot` and the range contract are produced once in Task 1 and consumed by Tasks 2 and 4.
