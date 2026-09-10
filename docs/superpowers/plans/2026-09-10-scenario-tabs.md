# Scenario Tabs Implementation Plan

> **For agentic workers:** Implement and verify each checked step in order.

**Goal:** Present the three winning examples as switchable tabs instead of three stacked cards.

**Architecture:** `ResultProof` owns the selected tab as local UI state. The result data remains unchanged; only the selected example is rendered in an accessible tab panel.

**Tech Stack:** React 19, TypeScript, CSS, Playwright

**Spec:** User request from 2026-09-10.

## Global Constraints

- Match the existing Drivers/Constructors segmented control.
- Support mouse, touch, Tab, Left Arrow, and Right Arrow input.
- Show exactly one scenario at a time.

---

### Task 1: Build and verify scenario tabs

- [ ] Add tab state, roles, labels, panel links, and arrow-key navigation.
- [ ] Add responsive styles using the current control tokens.
- [ ] Update browser tests to switch among all three scenarios.
- [ ] Run tests, type checking, lint, build, and desktop/mobile browser checks.
- [ ] Commit, push, deploy, and verify production.
