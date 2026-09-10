# Comparison Return Event Implementation Plan

> **For agentic workers:** Implement and verify each checked step in order.

**Goal:** Record use of “Back to standings” as `comparison_returned`, not as a page visit.

**Architecture:** The button sends a best-effort, non-blocking request containing the active comparison. A server-only route attaches the anonymous visitor hash and writes a typed Convex event.

**Tech Stack:** React 19, Next.js, TypeScript, Convex, Vitest, Playwright

**Spec:** User request from 2026-09-10.

## Global Constraints

- Returning must feel immediate even if analytics is unavailable.
- Store `driverId` for drivers, `constructorId` for teams, and `rivalId` for the dropdown choice.
- Ordinary initial page loads remain `visit` events.

---

### Task 1: Track comparison returns

- [x] Add `comparison_returned` to the event schema.
- [x] Add a protected Convex mutation and server bridge.
- [x] Add a validated API route and non-blocking button call.
- [x] Add tests and run all project checks.
- [x] Deploy and verify the production event record.
