# Comparison ID Migration Implementation Plan

> **For agentic workers:** Execute the schema transition in order; never remove the legacy field before production rows are migrated.

**Goal:** Replace stored `targetId` values with `driverId` for driver comparisons and `constructorId` for constructor comparisons, while retaining `rivalId`.

**Architecture:** First deploy a transition schema accepting old and new fields. New writes use the correct selected-competitor field, and a protected migration patches historical rows. After verifying no legacy fields remain, deploy the strict final schema without `targetId`.

**Tech Stack:** Convex, TypeScript, Next.js, Vitest

**Spec:** User request from 2026-09-10.

## Global Constraints

- Preserve all existing production comparison and visitor-event documents.
- Use `driverId` only for driver comparisons and `constructorId` only for team comparisons.
- Keep the dropdown selection in `rivalId`.
- Do not expose server credentials.

---

### Task 1: Transition and migrate

- [x] Deploy optional legacy and new fields.
- [x] Write all new comparisons with `driverId` or `constructorId`.
- [x] Run the protected migration over existing production rows.
- [x] Verify every comparison has the correct new selected-ID field.

### Task 2: Finalize and deploy

- [x] Remove `targetId` from the Convex schema and migration code.
- [x] Run tests, type checking, lint, and build.
- [ ] Commit, push, deploy, and verify a live driver and constructor comparison.
