# Demo Deck Text Generator

Auto-generates slide text for sprint demo decks from ticket data already in the sprint-notes app.

## Status

**Branch:** `feature/demo-deck-text-generator`
**Phase:** MVP complete — deterministic data + LLM prose generation working. Needs testing/iteration on output quality.

## What It Does

Sprint demo decks follow a 5-slide format used for 38+ sprints. Slides 2 and 3 require manually gathering ticket counts, point totals, platform groupings, and writing narrative summaries. This feature generates all of that text so it can be copied into the existing PowerPoint template.

### Two-phase generation

1. **Deterministic (instant):** Slide 1 title, Slide 2 ticket counts, Slide 2 metrics — computed from ticket data, no LLM needed
2. **LLM-assisted (async):** Slide 2 narrative, Slide 3 features, Slide 3 fixes — uses Claude Haiku for prose writing

### Slide breakdown

| Section | Source | Example Output |
|---------|--------|---------------|
| Slide 1 — Title | Sprint name + end date | `Sprint 55 Review — February 18, 2026` |
| Slide 2 — Ticket Counts | CP tickets by type + IT count vs avg | `32 story tasks, 3 bugs + 38 IT Helpdesk tasks (prev 35, +3 over avg)` |
| Slide 2 — Metrics | Points completed, in-flight buckets | `57 points were completed by the end of the sprint.` |
| Slide 2 — Narrative | LLM with style-guided system prompt | 1-3 sentences about sprint focus, capacity, scope creep |
| Slide 3 — Features | LLM condenses ticket summaries by platform | `Template Safari: Delivered X, completed Y (CP-XXXX, CP-YYYY).` |
| Slide 3 — Fixes | LLM condenses bug/hotfix summaries by platform | `Survey: Resolved X, fixed Y (CP-XXXX).` |

## Architecture

```
vite.config.ts          → /anthropic-api proxy (injects API key server-side)
src/services/claudeService.ts  → fetch wrapper (Haiku, temp=0.3, max_tokens=1024)
src/utils/demoDeckUtils.ts     → all data assembly + LLM prompt construction
src/components/overview/DemoDeckText.tsx  → UI component (textareas, copy, regenerate)
src/components/overview/DemoDeckText.css  → styling
```

### Data flow

```
Stores (sprintStore, notesStore, historyStore)
  ↓
DemoDeckText.tsx (component)
  ↓
demoDeckUtils.ts (deterministic functions → immediate render)
  ↓
demoDeckUtils.ts (LLM functions → claudeService.ts → /anthropic-api → Claude Haiku)
  ↓
Textareas (editable, with Copy buttons)
```

### Fallback behavior

If the Claude API is unavailable (no key, network error, rate limit), LLM functions return template-based fallback text instead of failing. The deterministic sections always work.

## Setup

Add your Anthropic API key to `sprint-notes/.env`:

```
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

Get a key at [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys).

## Files

### Created
- `src/services/claudeService.ts` — Claude API wrapper via Vite proxy
- `src/utils/demoDeckUtils.ts` — Deterministic + LLM-assisted generation functions
- `src/components/overview/DemoDeckText.tsx` — React component
- `src/components/overview/DemoDeckText.css` — Styling

### Modified
- `vite.config.ts` — Added `/anthropic-api` proxy route
- `.env.example` — Added `VITE_ANTHROPIC_API_KEY`
- `src/components/overview/TeamOverview.tsx` — Added collapsed Section
- `src/components/overview/index.ts` — Barrel export
