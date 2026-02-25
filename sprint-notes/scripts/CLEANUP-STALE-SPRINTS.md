# Cleanup Stale Sprint Data for Cancelled/WNI Tickets

## Problem

Tickets in "Will Not Implement" and "IT - Canceled" status were automatically carried forward sprint-to-sprint for months/years. We removed 42 such tickets from the active sprint (Sprint 56), but they still have closed sprint entries they shouldn't have, which skews historical sprint stats.

**Example:** CP-1462 was marked "Will Not Implement" on 2025-07-04 during Sprint 39. It then got dragged through Sprints 40-56 (17 extra sprints). After removing Sprint 56, it still pollutes stats for Sprints 40-55.

## Script

`cleanup-stale-sprint-data.cjs` — dry-run by default, sprint-by-sprint approach.

### Usage

```bash
cd sprint-notes

# Dry-run a single sprint
node scripts/cleanup-stale-sprint-data.cjs --sprint 55

# Inspect one ticket
node scripts/cleanup-stale-sprint-data.cjs --ticket CP-1462

# Test which API approach works for removal
node scripts/cleanup-stale-sprint-data.cjs --sprint 55 --probe

# Execute on a sprint (with confirmation prompt)
node scripts/cleanup-stale-sprint-data.cjs --sprint 55 --execute

# Small batch
node scripts/cleanup-stale-sprint-data.cjs --sprint 55 --execute --limit 3
```

### How It Works

1. Looks up the sprint by number (e.g. `--sprint 55` finds "Engineering Sprint 55")
2. Fetches all tickets in that sprint with terminal statuses via JQL
3. For each ticket, walks its changelog reverse-chronologically to find when it entered its current terminal status (cancellation date)
4. Classifies each sprint entry: **keep** if `startDate <= cancellationDate`, **remove** if after
5. Reports or executes removals

### Safety

- **Dry-run by default** — zero writes without `--execute`
- **Confirmation prompt** before any writes
- **Halts on first API failure**
- **Rate limiting** — 200ms between reads, 500ms between writes
- **Manual review list** — tickets with no changelog transition flagged separately

## Status: WIP

### Done
- Script created with full analysis logic
- Fixed `.env` parser — API token contains `=` signs, `split('=')` was truncating it (183 vs 192 chars). Fixed to use `indexOf('=')`.
- Sprint lookup works (confirmed: "Engineering Sprint 55", ID 1026)

### Known Issue: `expand: changelog` timeout
The `fetchTerminalTicketsInSprint()` function uses `expand: changelog` in the JQL search, which causes the JIRA API to hang/timeout when there are many tickets. The request to Sprint 55 never returned after 10+ minutes.

### Next Steps

1. **Fix the changelog fetch strategy** — Don't use `expand: changelog` in the search query. Instead:
   - Fetch tickets WITHOUT changelog expansion (fast)
   - Then fetch each ticket's changelog individually via `GET /rest/api/3/issue/{key}/changelog`
   - This is what `getFullChangelog()` already does — just need to always use it

2. **Run dry-run on Sprint 55** to see the full scope

3. **Run `--probe`** to test which API approach works for sprint removal:
   - Approach 1: `PUT` with `customfield_10020: [{id: 123}, ...]`
   - Approach 2: `PUT` with `customfield_10020: [123, ...]`
   - Approach 3: `POST /rest/agile/1.0/backlog/issue`

4. **Execute sprint-by-sprint**, working backwards from Sprint 55 toward the oldest affected sprint

### Also Note
The original approach tried to query ALL cancelled tickets globally — returned 30,000+ tickets across all projects. The sprint-by-sprint approach is much more targeted.
