# Main UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the repetitive pastel standings screen with a polished Formula 1 timing-desk interface that makes head-to-head comparison the clear primary task.

**Architecture:** Preserve the existing comparison API and calculation engine. Reshape the client state into an explicit two-step selection flow: choose a primary contender, choose a rival, then request the existing head-to-head result. Use one responsive workbench on desktop and a compact standings plus sticky comparison tray on mobile.

**Tech Stack:** Next.js 16, React 19, TypeScript, existing Barlow Semi Condensed and Source Sans 3 fonts, CSS.

**Spec:** Approved generated mockup in this conversation, with the correction that the tool must not claim to enumerate every possible scenario.

## Global Constraints

- Never say or imply that the head-to-head tool calculates every possible championship scenario.
- Describe results as verified head-to-head conditions and representative example paths.
- Keep all existing driver/constructor switching, API calls, retry handling, result tabs, keyboard behavior, and analytics events working.
- Do not add logos, car art, gradients, broad pastel status fills, decorative icons, or a red control on every standings row.
- Red is reserved for current selection and the primary comparison action.

---

### Task 1: Selection flow and component contract

**Files:** Modify `scenario-workbench.tsx`, `standings-panel.tsx`, and tests.

- [ ] Add separate primary-contender and rival selection actions.
- [ ] Require an explicit Compare action instead of calculating from every row dropdown.
- [ ] Preserve kind switching, busy/error handling, and comparison-return tracking.
- [ ] Add accessible selected states and keyboard-operable controls.

### Task 2: Championship battle workspace

**Files:** Create `comparison-workspace.tsx`; modify `scenario-dossier.tsx` and `result-proof.tsx`.

- [ ] Show current points, current gap, selection guidance, and maximum points remaining before calculation.
- [ ] Use accurate copy: verified head-to-head condition plus representative closest/quickest/slowest/maximum examples.
- [ ] Keep the existing disclaimer visibly attached to results.
- [ ] Add clear loading, error, empty, and populated states.

### Task 3: Responsive visual system

**Files:** Modify `app/globals.css` and `.interface-design/system.md`.

- [ ] Build a neutral timing tower with compact rows and small semantic status markers.
- [ ] Make the battle workspace the desktop focal point.
- [ ] Add a sticky mobile comparison tray and horizontal-safe result tables.
- [ ] Verify desktop and mobile hierarchy, contrast, focus, and touch targets.

### Task 4: Verification and release

**Files:** Update relevant end-to-end expectations if structure changes.

- [ ] Run unit tests, lint, build, and deployment checks.
- [ ] Test selection, comparison, results, kind switching, error states, desktop, and mobile in a real browser.
- [ ] Push to GitHub and deploy Vercel/Convex only after checks pass.
- [ ] Verify the live app and ensure the old domain remains unavailable.

## Self-review

- Coverage: approved layout, mobile behavior, accurate capability wording, and all current behavior are included.
- Placeholder scan: no deferred implementation placeholders.
- Type consistency: the workbench remains the single owner of selection and result state.
