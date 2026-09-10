# Guaranteed Championship Scenarios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a paginated page that lists every grouped, strict-points championship guarantee for the current top six drivers and top three constructors.

**Architecture:** A pure scenario engine will count and page position-count summaries without materializing the complete search space. A server route will load the verified active Convex snapshot, validate its version and the selected contender, and return a bounded page to a new client interface.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6, Vitest, Convex-backed approved datasets.

**Spec:** `docs/superpowers/plans/2026-09-10-guaranteed-scenarios-spec.md`

## Global Constraints

- A guarantee requires strictly more final points than every rival; do not include countback wins.
- Show only the active dataset's top six drivers and top three constructors in the selector, while checking every standings rival.
- Group race finishes by count, show the Sprint separately, and collapse P11–P22, DNF, and DNS into `0 points`.
- Treat constructor results as unordered legal pairs of the two cars' finishes.
- Return every matching summary through bounded, lowest-points-first pagination.
- Do not enumerate or materialize the full constructor search space.

---

### Task 1: Define and verify scenario outcomes

**Files:**
- Create: `src/product/guaranteed-scenarios.ts`
- Create: `src/product/guaranteed-scenarios.test.ts`

**Interfaces:**
- Consumes: `VerifiedFrozenDriverSnapshot` and `ChampionshipKind`.
- Produces: `ScenarioRequest`, `ScenarioPage`, `DriverScenario`, `ConstructorScenario`, and `calculateGuaranteedScenarioPage(snapshot, request)`.

- [ ] **Step 1: Write failing tests for finish buckets and guarantee rules**

Test that driver race buckets are P1–P10 plus zero, Sprint buckets are P1–P8 plus zero, constructor pairs never repeat a scoring position, pairs are unordered, zero can appear twice, and a result is accepted only when the selected final points are strictly above the maximum legal final points of the strongest rival.

```ts
expect(driverBuckets("race").map(x => x.points)).toEqual([25,18,15,12,10,8,6,4,2,1,0]);
expect(driverBuckets("sprint").map(x => x.points)).toEqual([8,7,6,5,4,3,2,1,0]);
expect(constructorBuckets("race")).toContainEqual(expect.objectContaining({ positions:[1,2], points:43 }));
expect(constructorBuckets("race")).not.toContainEqual(expect.objectContaining({ positions:[1,1] }));
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- src/product/guaranteed-scenarios.test.ts`

Expected: FAIL because `guaranteed-scenarios.ts` does not exist.

- [ ] **Step 3: Implement canonical outcome buckets**

Create immutable race and Sprint driver buckets. Derive unordered constructor pairs by choosing two distinct scoring positions or zero; attach their point sum and a stable key such as `01+02` or `03+00`.

- [ ] **Step 4: Implement strict guarantee evaluation**

For each candidate summary, compute the selected contender's added points. For every rival, compute the maximum legal added points after removing the selected driver's occupied position or the selected constructor's two occupied positions in every session. Accept only when:

```ts
selectedCurrentPoints + selectedAdditionalPoints >
Math.max(...rivals.map(rival => rival.currentPoints + rivalMaximumAdditionalPoints));
```

- [ ] **Step 5: Run the focused tests**

Run: `npm test -- src/product/guaranteed-scenarios.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the verified scenario domain**

```bash
git add src/product/guaranteed-scenarios.ts src/product/guaranteed-scenarios.test.ts
git commit -m "Add guaranteed scenario rules"
```

### Task 2: Add scalable counting and pagination

**Files:**
- Modify: `src/product/guaranteed-scenarios.ts`
- Modify: `src/product/guaranteed-scenarios.test.ts`

**Interfaces:**
- Consumes: canonical outcome buckets and strict guarantee evaluation from Task 1.
- Produces: opaque cursor paging through `calculateGuaranteedScenarioPage` with `items` and `nextCursor`.

- [ ] **Step 1: Write failing pagination tests**

Use small synthetic snapshots to compare paginated output against a tiny brute-force enumerator. Assert no duplicates or omissions across pages, ascending additional points, stable tie ordering, invalid cursor rejection, and `nextCursor: null` on the last page.

```ts
expect(allPagedItems).toEqual(bruteForceItems);
expect(new Set(allPagedItems.map(item => item.key)).size).toBe(allPagedItems.length);
expect(allPagedItems.map(item => item.additionalPoints)).toEqual(
  [...allPagedItems].map(item => item.additionalPoints).sort((a,b) => a-b)
);
```

- [ ] **Step 2: Run the focused test and verify the new cases fail**

Run: `npm test -- src/product/guaranteed-scenarios.test.ts`

Expected: FAIL because paging and counting are not implemented.

- [ ] **Step 3: Implement dynamic suffix counting**

Represent the ten races as a nondecreasing sequence of canonical outcome indices. Memoize suffix counts by remaining races, minimum next outcome index, accumulated selected points, and accumulated rival ceiling. Use `bigint` internally. This lets the engine count or skip a complete subtree without constructing its leaves or counting the entire result set.

- [ ] **Step 4: Implement cursor rank and page unranking**

Encode the next zero-based result rank plus a request fingerprint containing kind, contender, data version, and rule version. To fetch a page, walk counted subtrees in points-first order and subtract subtree sizes until reaching the requested rank. Return at most 25 summaries.

- [ ] **Step 5: Add frozen-data coverage tests**

Assert selectors resolve exactly six drivers and three constructors from the approved fixture, returned scenarios pass an independent strict-points check against every rival, result pages contain at most 25 items, and the constructor first page completes without full-space materialization.

- [ ] **Step 6: Run scenario tests and the full suite**

Run: `npm test -- src/product/guaranteed-scenarios.test.ts`

Expected: PASS.

Run: `npm test`

Expected: PASS.

- [ ] **Step 7: Commit scalable pagination**

```bash
git add src/product/guaranteed-scenarios.ts src/product/guaranteed-scenarios.test.ts
git commit -m "Page guaranteed scenarios without enumeration"
```

### Task 3: Add the protected scenario API

**Files:**
- Create: `app/api/scenarios/route.ts`
- Create: `src/product/guaranteed-scenario-result.ts`
- Create: `src/product/guaranteed-scenario-result.test.ts`
- Modify: `src/server/convex-store.ts`
- Modify: `src/server/rate-limit.ts`
- Modify: `src/server/convex-store.test.ts`

**Interfaces:**
- Consumes: `calculateGuaranteedScenarioPage`, verified snapshot loading, and anonymous rate limiting.
- Produces: `POST /api/scenarios` accepting `{kind, contenderId, dataVersion, ruleVersion, cursor?}` and returning a validated `ScenarioPage`.

- [ ] **Step 1: Write failing contract and store tests**

Test valid driver and constructor responses, malformed inputs, a contender outside the visible top-six/top-three scope, stale versions, cursor tampering, and unavailable Convex data.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- src/product/guaranteed-scenario-result.test.ts src/server/convex-store.test.ts`

Expected: FAIL because the parser and store operation do not exist.

- [ ] **Step 3: Add response parsing and store operation**

Implement `parseScenarioPage(value: unknown): ScenarioPage | null` and `loadGuaranteedScenarioPage(request)`. Load by requested data version, verify the selected contender's standings rank, then invoke the pure scenario engine.

- [ ] **Step 4: Add endpoint validation and rate limiting**

Add `scenarios` to `LimitedAction` with a conservative per-minute limit. Parse JSON, reject unknown kinds or missing identifiers, set `Cache-Control: private, no-store`, and map stale or invalid requests to HTTP 400 and data-service failures to HTTP 503.

- [ ] **Step 5: Run focused and full tests**

Run: `npm test -- src/product/guaranteed-scenario-result.test.ts src/server/convex-store.test.ts`

Expected: PASS.

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit the endpoint**

```bash
git add app/api/scenarios/route.ts src/product/guaranteed-scenario-result.ts src/product/guaranteed-scenario-result.test.ts src/server/convex-store.ts src/server/rate-limit.ts src/server/convex-store.test.ts
git commit -m "Add guaranteed scenarios API"
```

### Task 4: Build the scenarios page

**Files:**
- Create: `app/scenarios/page.tsx`
- Create: `src/components/guaranteed-scenarios-workbench.tsx`
- Create: `src/components/guaranteed-scenario-list.tsx`
- Modify: `app/globals.css`
- Modify: `src/components/scenario-workbench.tsx`

**Interfaces:**
- Consumes: `ProductData`, `POST /api/scenarios`, and `parseScenarioPage`.
- Produces: responsive `/scenarios` UI plus navigation between it and `/`.

- [ ] **Step 1: Add the server page shell**

Load active product data exactly as `/` does. Render the service-unavailable state on failure and pass verified product data to `GuaranteedScenariosWorkbench` on success.

- [ ] **Step 2: Add contender selection behavior**

Reuse the timing-tower structure, but pass only `standings.driver.slice(0, 6)` or `standings.constructor.slice(0, 3)`. Switching kind clears selection, results, cursor, and errors. Selecting a contender automatically requests its first page.

- [ ] **Step 3: Add scenario cards and paging**

Each card renders additional points, projected final points, grouped race outcomes such as `P1 × 3 races`, and a separate Sprint outcome. Constructor cards render paired outcomes such as `P1 + P2 × 2 races`. A `Load more` button appends the next 25 results using the returned cursor.

- [ ] **Step 4: Add honest page copy and states**

Use `Possible championship scenarios` as the heading. State that results guarantee a points lead, omit countback, treat all zero-point finishes alike, and check the entire standings field. Add accessible loading, empty, error, stale, and end-of-results states.

- [ ] **Step 5: Add navigation and responsive styling**

Add `All scenarios` to the existing product bar and `Head-to-head` to the new page. Extend existing timing-desk tokens; keep controls keyboard accessible and make scenario cards readable at 760px and below.

- [ ] **Step 6: Add component behavior coverage**

Move request-state transitions into small exported pure helpers if needed so Vitest can verify selection resets, append-versus-replace paging, and stale response rejection without adding a browser-test dependency.

- [ ] **Step 7: Run lint, tests, and production build**

Run: `npm run lint`

Expected: PASS.

Run: `npm test`

Expected: PASS.

Run: `npm run build`

Expected: PASS and `/scenarios` plus `/api/scenarios` appear in the route list.

- [ ] **Step 8: Commit the page**

```bash
git add app/scenarios/page.tsx src/components/guaranteed-scenarios-workbench.tsx src/components/guaranteed-scenario-list.tsx src/components/scenario-workbench.tsx app/globals.css
git commit -m "Add guaranteed championship scenarios page"
```

### Task 5: Verify the user journey and deployment readiness

**Files:**
- Modify only if a verification failure exposes a defect in files from Tasks 1–4.

**Interfaces:**
- Consumes: completed `/scenarios` page and API.
- Produces: evidence that the feature works at desktop and mobile sizes and is safe to deploy.

- [ ] **Step 1: Start the Convex-backed local app**

Run: `npm run start:convex:test`

Expected: the local Next.js server starts against the configured approved dataset.

- [ ] **Step 2: Verify driver flow in a browser**

Open `/scenarios`, choose the first driver, confirm results start at the lowest guaranteed additional points, confirm each race summary totals ten races, confirm the Sprint is separate, and load a second page without duplicates.

- [ ] **Step 3: Verify constructor flow in a browser**

Choose Constructors and the first team, confirm every race pair uses distinct scoring positions, paired counts total ten races, Sprint is separate, and the next page loads without freezing the interface.

- [ ] **Step 4: Verify mobile layout and navigation**

At 390px width, confirm selection, cards, `Load more`, `All scenarios`, and `Head-to-head` remain readable and usable.

- [ ] **Step 5: Run deployment readiness checks**

Run: `npm run verify:deployment`

Expected: PASS.

Run: `git status --short`

Expected: only intentional feature changes or pre-existing untracked artifacts are present.

- [ ] **Step 6: Commit any verification fixes**

```bash
git add <only files changed to correct verified defects>
git commit -m "Fix guaranteed scenarios verification issues"
```

## Self-review

- Spec coverage: page scope, strict guarantee definition, Sprint handling, zero-point grouping, team pair accuracy, complete matching summaries, ordering, paging, full-field checks, navigation, and responsive states each map to a task.
- Placeholder scan: no deferred behavior or unspecified error handling remains.
- Type consistency: the engine, parser, store, route, and client all use `ScenarioRequest` and `ScenarioPage`; cursors bind to the same kind, contender, and dataset versions.
