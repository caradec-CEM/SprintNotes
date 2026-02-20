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
