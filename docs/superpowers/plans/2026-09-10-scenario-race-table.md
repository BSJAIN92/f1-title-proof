# Scenario Race Table Implementation Plan

> **For agentic workers:** Implement and verify each checked step in order.

**Goal:** Replace each selected scenario's expandable text list with an always-visible race-position table.

**Architecture:** Keep the calculation response unchanged and convert its stable event strings into display rows at the component boundary. Render one semantic HTML table inside the active tab panel.

**Tech Stack:** React 19, TypeScript, CSS, Playwright

**Spec:** User request from 2026-09-10.

## Global Constraints

- Do not alter comparison calculations or Convex analytics.
- Show the table immediately when a scenario tab is selected.
- Preserve full competitor outcomes for drivers and constructors.
- Keep the table usable at desktop and mobile widths.

---

### Task 1: Replace the expandable list

- [ ] Parse date, event, session, target outcome, and rival outcome for display.
- [ ] Render a semantic, always-visible table and remove the disclosure button.
- [ ] Add responsive table styles and update browser coverage.
- [ ] Run tests, type checks, lint, build, and live desktop/mobile checks.
- [ ] Commit, push, deploy, and verify production.
