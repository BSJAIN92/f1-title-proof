# Head-to-Head Timing Paths Implementation Plan

> **For agentic workers:** Implement each checked step in order and verify the calculation before deployment.

**Goal:** Replace Stronger Winning Margin with Quickest and Slowest head-to-head example paths, rename the remaining tabs, and clearly state that the result is not a championship prediction.

**Architecture:** Extend each comparison example with an explanatory note and an optional unavailable reason. Keep the existing points-difference search for closest and maximum paths, calculate Quickest from the requested P1/P2 pattern (P1+P2 versus P3+P4 for constructors), and select a minimum-margin path that remains undecided until the final race for Slowest.

**Tech Stack:** TypeScript, React 19, Next.js, Vitest, Playwright

**Spec:** User clarification in this conversation on 2026-09-10.

## Global Constraints

- This is head-to-head only, not an actual championship prediction.
- Drivers: Quickest uses contender P1 and rival P2 in every remaining race and sprint.
- Constructors: Quickest uses both cars, with contender P1+P2 and rival P3+P4.
- Slowest must remain mathematically undecided until the final race and finish with the smallest available positive margin.
- Tabs are Closest Points Win, Quickest, Slowest, and Maximum Points Win.
- Back to standings remains pinned at the top while comparison results scroll.

---

### Task 1: Calculate timing paths

**Files:**
- Modify: `src/product/head-to-head.ts`
- Modify: `src/product/head-to-head-result.ts`
- Test: `src/product/head-to-head.test.ts`

- [x] Add failing tests for tab order, quickest clinch timing, slowest final-race timing, constructor two-car outcomes, and unavailable quickest paths.
- [x] Extend the example response type with a note and optional unavailable reason.
- [x] Implement the four ordered examples and validate the response parser.
- [x] Run the focused product tests.

### Task 2: Present the new paths

**Files:**
- Modify: `src/components/result-proof.tsx`
- Modify: `src/components/scenario-dossier.tsx`
- Modify: `app/globals.css`
- Test: `e2e/milestone-12.spec.ts`

- [x] Add the head-to-head disclaimer.
- [x] Keep Back to standings visible in a sticky top navigation row.
- [x] Display each timing note and an unavailable state without an empty table.
- [x] Update the four-tab keyboard and content checks.
- [x] Run all tests, lint, and the production build.

### Task 3: Publish and verify

- [x] Commit and push to GitHub.
- [x] Deploy Convex and Vercel through the production deployment.
- [x] Verify all four tabs and the disclaimer on the live site.
