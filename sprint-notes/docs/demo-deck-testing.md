# Demo Deck Generator — Testing Checklist

## Functional tests

- [ ] Select a closed sprint (e.g., Sprint 55) → expand "Demo Deck Text"
- [ ] Slide 1 title shows correct sprint number and formatted end date
- [ ] Slide 2 counts match: story tasks, bugs, IT count with average comparison
- [ ] Slide 2 metrics show total points completed
- [ ] Slide 2 narrative generates 1-3 natural sentences matching deck tone
- [ ] Slide 3 features group by platform with ticket keys in parentheses
- [ ] Slide 3 fixes group by platform with ticket keys in parentheses
- [ ] Edit a textarea → Copy → paste elsewhere → verify edited text is what was copied
- [ ] "Regenerate AI Text" button produces a different draft
- [ ] Select a different sprint → all fields update

## Active sprint behavior

- [ ] Select an active sprint → Slide 2 metrics include "in progress" and "not started" lines
- [ ] Select a closed sprint → only "completed" line shown (no in-progress/not-started)

## Fallback / error handling

- [ ] Remove or invalidate `VITE_ANTHROPIC_API_KEY` → deterministic fields still render
- [ ] LLM sections show template-based fallback text instead of empty/error
- [ ] Console shows warning (not crash) for API errors

## UI / styling

- [ ] Section defaults to collapsed
- [ ] Loading shimmer animation shows while LLM sections generate
- [ ] Copy button briefly shows "Copied" state (green)
- [ ] Dark mode renders correctly
- [ ] Print styles hide buttons, textareas have clean borders

## Known validation data (Sprint 55)

From the original plan, Sprint 55 should show approximately:
- 32 story tasks, 3 bugs
- 57 points completed
- 38 IT Helpdesk tasks

Use these as a sanity check — exact numbers depend on the data loaded from JIRA.
