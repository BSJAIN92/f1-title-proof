# Title Proof Interface System

## Direction

Title Proof should feel like a Formula 1 pit-wall timing surface: exact, restrained, dense enough for comparison work, and calm enough for careful reading. The interface uses race-domain structure rather than decorative motorsport imagery.

- Domain: pit wall, timing tower, telemetry, championship standings, head-to-head battles, verified proof.
- Color world: carbon black, graphite, warm timing-sheet white, signal red, verified green, caution amber.
- Signature: ranked comparison rows use timing-tower numbers, paired names, and a thin signal-red activity meter. Daily activity uses a compact telemetry strip.
- Avoid: generic equal-weight statistic cards, multicolor charts, rounded SaaS containers, gradients, oversized decorative icons, and motorsport decoration without meaning.

## Foundations

- Depth strategy: borders and small surface shifts only. Do not add drop shadows to dark product surfaces.
- Spacing base: 4px. Common steps are 8, 12, 16, 20, 24, 32, 40, 48, and 64px.
- Corners: square by default for timing and workbench surfaces. Use an existing radius only where the surrounding product already uses it.
- Canvas: `--carbon`.
- Primary surface: `--graphite`.
- Raised or selected surface: `--graphite-raised`.
- Primary text: `--warm-white`.
- Supporting text: `--text-secondary`.
- Metadata text: `--text-muted`.
- Dividers: `--line`; selected or important boundaries: `--line-strong`.
- Main action and activity accent: `--signal`.
- Verified states only: `--verified`.
- Caution and provenance notes only: `--amber`.
- Keyboard focus: `--focus` with a 2px outline and 2px offset.

## Typography and hierarchy

- Display and interface labels: Barlow Semi Condensed, weights 500–600.
- Body and explanatory copy: Source Sans 3, weights 400–600.
- Large page title: 36–64px, weight 600, tight line height and slightly negative letter spacing.
- Section title: 26–32px, weight 600.
- Body: 14–18px depending on reading context.
- Eyebrow and table labels: 11–12px, weight 600, uppercase, `.08em–.12em` tracking.
- Dynamic values always use tabular numbers.
- Hierarchy should come from weight, spacing, and text tone before adding size or color.

## Density and layout

- Desktop page edge: 40–64px; phone page edge: 14–20px.
- Dashboard panels: 24px desktop padding and 14–18px phone padding.
- Control height: 44px minimum; primary action height: 48px.
- Use uneven rhythm: compact controls, open space before the primary data region, then tightly grouped rows.
- On phones, summary metrics form two columns when readable; the last unpaired metric spans both columns.
- Charts with multiple time buckets stay on one horizontal row and scroll rather than wrapping.

## Reusable patterns

### Period filter

- 44px minimum height, square corners, quiet border.
- Active preset uses the signal-red fill.
- Custom dates remain grouped as one form and stack beneath presets on phones.
- Always state the timezone used for boundaries.

### Metric strip

- One continuous divided strip, not unrelated floating cards.
- Label: 11px uppercase muted text.
- Value: 30–48px Barlow Semi Condensed, weight 600, tabular numbers.
- Note: 12–13px muted text.
- Only the focal value receives signal red.

### Telemetry chart

- Visitors use secondary gray; comparisons use signal red.
- Thin paired bars share one consistent scale.
- Daily comparison-per-user value sits directly beneath each bar pair.
- Zero days remain visible to preserve the time sequence.

### Timing-tower ranking

- Row minimum height: 52–64px.
- Rank is a two-digit signal-red label.
- Matchup names lead; count aligns right with tabular numbers.
- A 2px activity meter gives relative popularity without adding another chart library.

### Private login

- Centered surface with a 4px signal-red top rule.
- One password field and one primary action.
- Errors appear in place without moving the surrounding structure unnecessarily.
- Maintain visible keyboard focus, HTTP-only signed sessions, and generic failure wording.

## Required states

Every data surface must support populated, empty, loading or pending, and unavailable states. Every control must have default, hover, active, focus, and disabled behavior. Respect `prefers-reduced-motion`; product interactions should feel immediate and should not use decorative animation.
