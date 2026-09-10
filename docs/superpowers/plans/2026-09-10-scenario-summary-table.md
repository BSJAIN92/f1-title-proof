# Scenario Summary Table Implementation Plan

> **For agentic workers:** Implement and verify each checked step in order.

**Goal:** Summarize the selected competitor's finish counts above each scenario's event table.

**Architecture:** Derive grouped rows from the already parsed representative example. Group by session type and finish, and clearly label counts as belonging to that example rather than all possible winning paths.

**Tech Stack:** React 19, TypeScript, CSS, Playwright

**Spec:** User request from 2026-09-10.

## Global Constraints

- Do not describe a representative example as a mathematical guarantee.
- Update the summary immediately when the scenario tab changes.
- Keep the detailed event table visible below the summary.

---

### Task 1: Add and verify the summary

- [ ] Group selected-competitor finishes by race/sprint and position.
- [ ] Render the grouped counts in a semantic table above the detailed events.
- [ ] Add responsive styling and browser coverage.
- [ ] Run all checks, deploy, and inspect desktop and mobile production views.
