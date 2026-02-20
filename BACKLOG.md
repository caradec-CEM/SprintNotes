# Sprint Notes App — Feature Backlog

## Carry-Over Impact Metrics
**Priority:** High
**Effort:** Medium (~2-3 files)

Surface carry-over data in the team overview and engineer panels so sprint reviews can quantify inherited vs new work at a glance.

- Add carry-over counts and points to `EngineerMetrics` (e.g., `carryOverCount`, `carryOverPts`)
- Show in Team Overview summary table: "X of Y tickets carried over (Z pts)"
- Add a small carry-over % indicator per engineer in their metrics grid
- Optionally trend carry-over rate across sprints in the team trends chart
- Builds directly on the `isCarryOver` flag already on every `Ticket`

---

## Dark Mode
**Priority:** Medium
**Effort:** Medium (~2-3 files)
**Status:** In Progress (feature/dark-mode branch)

The app already uses CSS custom properties (`--color-bg`, `--color-text`, etc.) so a dark theme is mostly a matter of defining an alternate set of variable values and wiring up a toggle.

- Define a `[data-theme="dark"]` block in `src/styles/index.css` with dark palette values
- Add a theme toggle button in the Header component
- Persist preference in `localStorage`
- Ensure all components use existing CSS variables (audit for any hard-coded colors)
- Verify badge colors (type, priority, carry-over) remain readable on dark backgrounds

---

## Vacation / Time-Off Enhancements
**Priority:** High (next after Dark Mode)
**Effort:** Medium (~3-4 files)

Expand the existing time-off tracking (`EngineerTimeOff`, `ptoDays`, `workingDays`) into a more complete vacation/availability feature.

- Make the time-off inputs more discoverable and easier to use in the engineer panel
- Show time-off impact on expected velocity and sprint capacity
- Surface team-wide availability summary in Team Overview (e.g., total PTO days, effective team capacity %)
- Consider a visual calendar or timeline showing who's out when during the sprint
- Integrate with capacity planning to auto-adjust expectations based on PTO

---

## Capacity Planning / Overallocation Flagging
**Priority:** Medium
**Effort:** Large (~4-5 files, new component)

Use the existing time-off tracking (`EngineerTimeOff`) to compare expected capacity against actual output and flag potential over- or under-allocation.

- Calculate expected velocity per engineer: `(workingDays / 10) * historicalAvgPoints`
- Compare against actual sprint points to produce a capacity utilization %
- Add a Capacity view (new component or section in Team Overview) showing:
  - Each engineer's working days, expected points, actual points, utilization %
  - Color coding: green (80-110%), yellow (110-130% or < 70%), red (> 130%)
- Flag engineers who are consistently over-allocated across recent sprints
- Requires sprint history data (already available via `SprintHistory`) for baseline averages

---

## UI/UX Audit Fixes
**Source:** UI/UX architect review (Feb 2026)

### P0 — Dark Mode Fixes (broken in dark mode)
- **Chart tooltip/legend text color not set** — Recharts tooltip and legend text inherits browser default, invisible on dark backgrounds. Set `color: var(--color-text)` on `.recharts-tooltip-wrapper` and legend items.
- **Sprint selector dropdown arrow SVG hardcoded** — The `<select>` dropdown arrow uses a hardcoded light-mode color in the `background-image` SVG. Swap to `var(--color-text)` or encode dynamically.
- **ActionItems input missing background/color** — The text input in ActionItems doesn't set `background` or `color`, so it inherits the wrong values in dark mode.
- **Focus ring color hardcoded** — `:focus-visible` outlines use hardcoded `rgba(0, 82, 204, 0.6)` instead of a CSS variable. Define `--color-focus-ring` and use it everywhere.

### P1 — Visual / UX Fixes
- **Type badge contrast fails WCAG AA** — Story (green-on-green-tint) and Task (blue-on-blue-tint) badges have insufficient contrast ratios. Darken the text color or adjust tint backgrounds.
- **MetricCard capacity variant bug** — Capacity utilization thresholds use `warning`/`warning` instead of `warning`/`danger` for the over-allocated state.
- **DevReviewRatioBar label colors don't match segment colors** — The text labels ("Dev" / "Review") use generic colors that don't match the bar segment fills. Align label colors with `--color-chart-dev` and `--color-chart-review`.
- **Opacity-based muting hurts accessibility** — `duration--muted` and similar classes use `opacity: 0.7` which can make text hard to read. Use a dedicated muted text color variable instead.

### P2 — Polish
- **No responsive breakpoints** — The app has no `@media` breakpoints; tables and panels overflow on narrow viewports. Add breakpoints for tablet (768px) and mobile (480px).
- **Duplicate PTO editing surface** — PTO days can be edited in both the SummaryTable and the TimeOffEditor. Consolidate to one location to avoid confusion.
- **Emoji theme toggle** — The dark mode toggle uses emoji (sun/moon) instead of SVG icons. Replace with proper icon components for consistent rendering across platforms.
- **Missing ARIA roles on tab bar** — The engineer/team tab navigation lacks `role="tablist"`, `role="tab"`, and `aria-selected` attributes for screen reader support.
- **Theme transition flash** — Add `transition: background-color 0.2s, color 0.2s` on `body` or `:root` to smooth the light-to-dark switch.
