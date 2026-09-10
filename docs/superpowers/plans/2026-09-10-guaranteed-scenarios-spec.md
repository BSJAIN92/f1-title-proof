# Guaranteed Championship Scenarios Specification

## User outcome

Add a `/scenarios` page where a visitor chooses one of the current top six drivers or top three constructors and browses every grouped finishing summary that guarantees that contender finishes strictly ahead of every rival on points.

## Scenario meaning

- A guarantee must hold against the strongest legal results available to every rival after accounting for the positions occupied by the selected contender.
- A points tie is not a guarantee. Countback is excluded from this version.
- Race order does not matter. Ten race results are grouped by how many times each finish occurs.
- A driver's race finish is one of P1 through P10 or `0 points`. Positions P11 through P22, DNF, and DNS share the `0 points` bucket.
- The one Sprint result is shown separately as P1 through P8 or `0 points`.
- A constructor race result is an unordered pair of distinct scoring positions, one scoring position plus `0 points`, or `0 points + 0 points`. Scoring positions occupied by the two cars cannot match.
- A constructor Sprint result follows the same pairing rule using P1 through P8 and `0 points`.
- Constructor race summaries group identical paired finishes, for example `P1 + P2 × 3 races`.
- Every distinct matching position-count summary is available. Different summaries that score the same points remain separate results.

## Selection and ordering

- Driver choices are standings positions 1 through 6 from the active approved dataset.
- Constructor choices are standings positions 1 through 3 from the active approved dataset.
- Switching championship type clears the selected contender and results.
- Results sort by the selected contender's additional points ascending. A deterministic finish-key order breaks ties.
- Results load on demand in bounded pages. The browser never receives or stores the complete result set.

## Page and navigation

- The existing `/` head-to-head page remains unchanged apart from a navigation link to `/scenarios`.
- `/scenarios` uses the existing timing-desk visual language and responsive behavior.
- Replace the main content heading with `Possible championship scenarios` and explain that only strict-points guarantees are included.
- Each result card shows additional points, projected final points, grouped race finishes, and the separate Sprint finish.
- Empty, loading, error, stale-data, and no-selection states must be explicit.

## Safety and performance

- Scenario generation runs only on the server against the verified Convex snapshot.
- Requests bind to `dataVersion` and `ruleVersion`; stale requests fail.
- Inputs and cursors are validated, and the endpoint is rate-limited.
- Pagination must skip whole combinatorial ranges by counting valid suffixes. It must not materialize trillions of constructor summaries or count the complete result set before returning a page.
- The guarantee calculation includes all eligible and ineligible standings rivals, not only the contenders displayed in the selector.
