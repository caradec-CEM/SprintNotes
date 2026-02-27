# Demo Deck Generator — Future Work

Ideas for iteration once the MVP is validated against real sprint data.

## Prompt tuning

- [ ] Feed actual slide text from past decks (sprint-demos/*.pptx) into the system prompts as few-shot examples
- [ ] Tune temperature / adjust system prompt phrasing based on output quality
- [ ] Consider adding the sprint number context so the LLM can reference it naturally ("Sprint 55 was primarily focused on...")

## Output accuracy

- [ ] Verify IT Helpdesk average comparison uses the right baseline (currently uses `SprintSummary.totalTickets` which is IT ticket count)
- [ ] Confirm carry-over detection (`isCarryOver`) is accurate for narrative context
- [ ] Validate "in progress" vs "not started" status bucketing matches JIRA workflow statuses — current logic uses substring matching on status names

## UX improvements

- [ ] "Copy All" button that combines all slide text with slide headers as delimiters
- [ ] Persist edited text per sprint (currently lost on navigation) — could use notesStore pattern
- [ ] Show a diff or indicator when user has edited LLM-generated text
- [ ] Add a "Use fallback" toggle to skip LLM calls entirely for offline use
- [ ] Consider moving the section to its own tab or modal to reduce Team Overview clutter

## Writing style refinement

The system prompts encode the writing style observed across 38 decks:

**Slide 2 narrative patterns:**
- "This sprint was primarily focused on [platforms]..."
- "Despite being one engineer short, the team..."
- "Scope creep was steady/minimal."
- "The team maintained strong velocity despite [challenge]."

**Slide 3 verb choices:**
- Features: Delivered, Completed, Implemented, Advanced
- Fixes: Resolved, Fixed, Addressed

These are in `src/utils/demoDeckUtils.ts` in the `NARRATIVE_SYSTEM_PROMPT` and `SLIDE3_SYSTEM_PROMPT` constants. Update them as the deck style evolves.

## Technical

- [ ] Add rate limiting / debounce for regenerate button
- [ ] Consider caching LLM responses per sprint ID to avoid redundant API calls
- [ ] The Vite proxy only works in dev — if a production build is ever needed, add a serverless function or direct API call with key management
