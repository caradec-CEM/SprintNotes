/**
 * Demo Deck Text Generator utilities.
 *
 * Two-phase generation:
 * 1. Deterministic (no LLM): slide2Summary, slide2Metrics
 * 2. LLM-assisted (async): slide2Narrative, slide3Features, slide3Fixes
 */

import type { Ticket, SprintData, SprintCapacity, EngineerTimeOff, SprintSummary } from '../types';
import { getPrimaryPlatform } from '../config/labels';
import { getEngineerMembers } from '../stores/teamStore';
import { computeTeamCapacityPercent, computeExpectedPoints } from './capacityUtils';
import { generateText } from '../services/claudeService';

// ── Types ────────────────────────────────────────────────────────────

export interface DemoDeckInput {
  sprint: SprintData;
  sprintState: 'active' | 'closed';
  inFlightTickets: Ticket[];
  capacity: SprintCapacity;
  timeOff: Record<string, EngineerTimeOff>;
  recentSprints: SprintSummary[];
}

export interface DemoDeckOutput {
  slide2Summary: string;
  slide2Metrics: string;
  slide2Narrative: string;
  slide3Features: string;
  slide3Fixes: string;
}

// ── Slide 2: Summary line ───────────────────────────────────────────

export function generateSlide2Summary(
  tickets: Ticket[],
  recentSprints: SprintSummary[]
): string {
  const cpTickets = tickets.filter((t) => t.project === 'CP');
  const itTickets = tickets.filter((t) => t.project === 'IT');

  // Count CP by type: Story+Task vs Bug
  const storyTaskCount = cpTickets.filter(
    (t) => t.type === 'Story' || t.type === 'Task'
  ).length;
  const bugCount = cpTickets.filter((t) => t.type === 'Bug').length;

  const itCount = itTickets.length;

  // IT average from recent sprints (totalTickets = IT ticket count in history store)
  const itCounts = recentSprints
    .map((s) => s.totalTickets ?? 0)
    .filter((n) => n > 0);
  const itAvg = itCounts.length > 0
    ? Math.round(itCounts.reduce((a, b) => a + b, 0) / itCounts.length)
    : null;

  const cpLine = `${storyTaskCount} story tasks, ${bugCount} bug${bugCount !== 1 ? 's' : ''}`;
  let itLine = `${itCount} IT Helpdesk task${itCount !== 1 ? 's' : ''}`;

  if (itAvg !== null) {
    // Find the most recent sprint's IT count for "prev" reference
    const prevItCount = recentSprints.length > 0
      ? recentSprints[recentSprints.length - 1].totalTickets ?? null
      : null;
    const diff = itCount - itAvg;
    const sign = diff >= 0 ? '+' : '';
    if (prevItCount !== null) {
      itLine += ` (prev ${prevItCount}, ${sign}${diff} over avg)`;
    } else {
      itLine += ` (${sign}${diff} over average)`;
    }
  }

  return `${cpLine}\n${itLine}`;
}

// ── Slide 2: Metrics ────────────────────────────────────────────────

export function generateSlide2Metrics(
  tickets: Ticket[],
  sprintState: 'active' | 'closed',
  inFlightTickets: Ticket[]
): string {
  const cpDone = tickets.filter((t) => t.project === 'CP');
  const donePoints = cpDone.reduce((sum, t) => sum + t.points, 0);

  const lines: string[] = [
    `${donePoints} points were completed by the end of the sprint.`,
  ];

  if (sprintState === 'active' && inFlightTickets.length > 0) {
    // Bucket in-flight tickets by status
    const inProgress = inFlightTickets.filter((t) => {
      const s = (t.status ?? '').toLowerCase();
      return s.includes('in progress');
    });
    const notStarted = inFlightTickets.filter((t) => {
      const s = (t.status ?? '').toLowerCase();
      return s.includes('to do') || s.includes('open') || s.includes('backlog') || s === '';
    });

    if (inProgress.length > 0) {
      const pts = inProgress.reduce((sum, t) => sum + t.points, 0);
      lines.push(
        `${inProgress.length} task${inProgress.length !== 1 ? 's' : ''} (${pts} points) were in progress.`
      );
    }
    if (notStarted.length > 0) {
      const pts = notStarted.reduce((sum, t) => sum + t.points, 0);
      lines.push(
        `${notStarted.length} task${notStarted.length !== 1 ? 's' : ''} (${pts} points) were not started.`
      );
    }
  }

  return lines.join('\n');
}

// ── Slide 2: Narrative (LLM-assisted) ───────────────────────────────

const NARRATIVE_SYSTEM_PROMPT = `You write the opening narrative for an engineering team's sprint demo deck.

This narrative goes on Slide 1. Slide 2 enumerates the features and fixes that were delivered. Your job is NOT to recap what was built — that would make Slide 2 redundant. Your job is to frame HOW the sprint went and WHY.

Focus on:
- Sprint outcome: points delivered vs the capacity-adjusted expectation, stated in POINTS (e.g. "40 points, 4 over the expected 36"). Never use percentages.
- Team capacity: PTO, holidays, headcount changes, effective working days.
- Carry-over context: was the team carrying a heavy load from last sprint? Did that help or hurt?
- Contributing factors: scope creep, elevated IT/support volume, blockers, sprint length.
- At most ONE high-level mention of where the bulk of effort went (e.g. "the bulk of investment went to CEM Collect"). Do NOT name multiple platforms. Do NOT describe themes, work types, or what was delivered on each platform.

Hard rules:
- 2-3 sentences. Past tense. Factual, concise, professional.
- No bullet points. No platform-by-platform breakdown.
- Express all comparisons as absolute NUMBERS, never percentages — points for velocity, ticket counts for IT volume. Always cite the expected figure alongside the actual (e.g. "36 points against an expected 38", "18 IT tickets vs the usual 12").
- Do NOT list features, themes, or work types. Do NOT use words like "delivered", "completed", "implemented", "advanced", "resolved" — those belong on Slide 2.
- Do NOT start with "During this sprint" — vary the opening.

Examples of the right framing:

Example 1 (strong sprint, heavy carry-over):
"The team put up 48 points against an expected 42, six over target despite a heavy carry-over load from the previous sprint, with the bulk of investment going to CEM Collect. IT helpdesk volume ran high at 18 tickets versus the usual 12, adding background pressure on the team's bandwidth."

Example 2 (capacity-impacted sprint):
"Down two engineers for most of the sprint due to PTO, the team landed 31 points against an expected 39 — eight under target. Carry-over from the previous sprint was minimal, so the shortfall reflects available capacity rather than scope changes."

Example 3 (short/holiday sprint):
"A holiday-shortened sprint left the team with only 7 effective working days. The 28 points delivered landed right on the ~29 expected at reduced capacity, with most of the available bandwidth going to CEM Collect."

Example 4 (overcommitted sprint):
"The team closed 34 points against an expected 41, seven short of target, with a high carry-over ratio suggesting last sprint was overcommitted. Steady scope creep through the sprint and elevated IT volume contributed to the lower throughput."

Example 5 (clean, on-pace sprint):
"The team delivered 40 points, right on its expected mark with no notable capacity disruptions. Carry-over from the previous sprint was light and IT volume was in a normal range."`;

export type GeneratedText = { text: string; source: 'ai' | 'fallback' };

export async function generateSlide2Narrative(
  sprint: SprintData,
  tickets: Ticket[],
  capacity: SprintCapacity,
  timeOff: Record<string, EngineerTimeOff>,
  recentSprints: SprintSummary[]
): Promise<GeneratedText> {
  const cpTickets = tickets.filter((t) => t.project === 'CP');

  // Dominant platform (single signal — name only, for framing)
  const platformPoints = new Map<string, number>();
  for (const t of cpTickets) {
    const plat = toDemoDeckPlatformName(getPrimaryPlatform(t.labels));
    platformPoints.set(plat, (platformPoints.get(plat) ?? 0) + t.points);
  }
  const totalPts = cpTickets.reduce((sum, t) => sum + t.points, 0);
  const sortedPlatforms = [...platformPoints.entries()].sort((a, b) => b[1] - a[1]);
  const topPct = sortedPlatforms.length > 0 && totalPts > 0
    ? Math.round((sortedPlatforms[0][1] / totalPts) * 100) : 0;
  const dominantPlatform = topPct > 40 ? sortedPlatforms[0][0] : null;

  // PTO summary (engineers only — admins aren't part of the capacity denominator)
  const engineerTeam = getEngineerMembers();
  const ptoEngineers = engineerTeam
    .filter((m) => timeOff[m.id] && timeOff[m.id].ptoDays > 0)
    .map((m) => `${m.name}: ${timeOff[m.id].ptoDays}d PTO`);
  const totalPtoDays = engineerTeam.reduce(
    (sum, m) => sum + (timeOff[m.id]?.ptoDays ?? 0), 0
  );

  // Carry-over count
  const carryOverCount = cpTickets.filter((t) => t.isCarryOver).length;
  const carryOverRatio = cpTickets.length > 0
    ? carryOverCount / cpTickets.length : 0;

  // Total points vs recent average
  const recentPts = recentSprints
    .map((s) => s.totalPoints ?? 0)
    .filter((n) => n > 0);
  const avgPts = recentPts.length > 0
    ? Math.round(recentPts.reduce((a, b) => a + b, 0) / recentPts.length)
    : null;
  const rawDiffPts = avgPts !== null ? totalPts - avgPts : null;

  // Capacity shortfall
  const daysLost = capacity.defaultWorkingDays - capacity.effectiveSprintDays;

  // Capacity-adjusted expectation: scale the recent average down by this sprint's
  // team capacity % (which already folds in both PTO and holidays via workingDays).
  // The headline outcome compares actual points against THIS expected figure — not
  // the raw average — so a low-capacity sprint isn't wrongly flagged as "under".
  const engineerTimeOffs = engineerTeam.map((m) =>
    timeOff[m.id] ?? { ptoDays: 0, workingDays: capacity.effectiveSprintDays }
  );
  const capacityPercent = computeTeamCapacityPercent(engineerTimeOffs, capacity.defaultWorkingDays);
  const expectedPts = avgPts !== null ? computeExpectedPoints(avgPts, capacityPercent) : null;
  // Delta in POINTS (not %): positive = over expected, negative = under.
  const ptsVsExpected = expectedPts !== null ? totalPts - expectedPts : null;

  // Build context for LLM — outcome + capacity + factors only.
  // Intentionally omits per-platform ticket breakdowns; that detail belongs on Slide 2.
  const context = [
    `Sprint: ${sprint.name}`,
    dominantPlatform
      ? `Bulk of investment went to ${dominantPlatform} (${topPct}% of points). Mention this once at most — do not enumerate other platforms.`
      : 'No single platform dominated — do not name platforms in the narrative.',
    `Total points completed: ${totalPts}`,
    expectedPts !== null
      ? `Capacity-adjusted expectation: ~${expectedPts} points this sprint (team avg ${avgPts} scaled to ${capacityPercent}% capacity). Actual ${totalPts} = ${ptsVsExpected === 0 ? 'exactly on target' : `${Math.abs(ptsVsExpected!)} point${Math.abs(ptsVsExpected!) !== 1 ? 's' : ''} ${ptsVsExpected! > 0 ? 'over' : 'under'} the expected ~${expectedPts}`}. THIS is the real outcome — use it as the headline. State it in POINTS (e.g. "X points, Y over/under the expected Z"), never as a percentage.`
      : avgPts !== null ? `Team average: ${avgPts} points (no capacity adjustment available)` : 'No velocity baseline available.',
    avgPts !== null
      ? `For context only (do NOT lead with this): ${rawDiffPts === 0 ? 'raw points matched the' : `raw points were ${Math.abs(rawDiffPts!)} ${rawDiffPts! > 0 ? 'over' : 'under'} the`} unadjusted ${avgPts}-pt average.`
      : '',
    `Effective sprint days: ${capacity.effectiveSprintDays} of ${capacity.defaultWorkingDays}${daysLost > 0 ? ` (${daysLost} day${daysLost !== 1 ? 's' : ''} lost to holidays)` : ''}`,
    totalPtoDays > 0
      ? `PTO impact: team was down ${totalPtoDays} engineer-day${totalPtoDays !== 1 ? 's' : ''} (${ptoEngineers.join('; ')}), reflected in the ${capacityPercent}% capacity figure above.`
      : 'No PTO this sprint.',
    `Carry-over tickets: ${carryOverCount} of ${cpTickets.length} total${carryOverRatio > 0.25 ? ' — high carry-over ratio suggests overcommitment last sprint' : ''}`,
    `Team size: ${engineerTeam.length} engineers`,
    (() => {
      const itTickets = tickets.filter((t) => t.project === 'IT');
      const itTicketCount = itTickets.length;
      const itHistoryCounts = recentSprints
        .map((s) => s.totalTickets ?? 0)
        .filter((n) => n > 0);
      const itHistoryAvg = itHistoryCounts.length > 0
        ? Math.round(itHistoryCounts.reduce((a, b) => a + b, 0) / itHistoryCounts.length)
        : null;
      if (itHistoryAvg !== null && itHistoryAvg > 0) {
        const itDelta = itTicketCount - itHistoryAvg;
        const aboveBelow = itDelta >= 0 ? 'above' : 'below';
        const line = `IT Helpdesk tickets: ${itTicketCount} (avg ${itHistoryAvg}, ${Math.abs(itDelta)} ${aboveBelow} average) — express in ticket counts, not percentages`;
        // Flag as notable when meaningfully above the usual volume (>20% over).
        return itDelta > itHistoryAvg * 0.2 ? `${line}; higher than usual IT volume` : line;
      }
      return `IT Helpdesk tickets: ${itTicketCount}`;
    })(),
  ].filter(Boolean).join('\n');

  const result = await generateText(NARRATIVE_SYSTEM_PROMPT, context);

  if (result) return { text: result, source: 'ai' as const };

  // ── Deterministic fallback: outcome-first, no feature enumeration ──

  const sentences: string[] = [];

  // Sentence 1: Velocity outcome vs the capacity-adjusted expectation (not raw avg),
  // so PTO/holiday-shortened sprints aren't wrongly described as under-delivering.
  // Stated in points, not percentages.
  if (ptsVsExpected !== null && capacityPercent < 100 && expectedPts !== null) {
    if (Math.abs(ptsVsExpected) <= 2) {
      sentences.push(
        `The team delivered ${totalPts} points, on target with the ~${expectedPts} expected at ${capacityPercent}% capacity this sprint.`
      );
    } else {
      const direction = ptsVsExpected > 0 ? 'over' : 'under';
      sentences.push(
        `The team delivered ${totalPts} points, ${Math.abs(ptsVsExpected)} ${direction} the ~${expectedPts} expected once PTO and holidays are factored in.`
      );
    }
  } else if (rawDiffPts !== null && Math.abs(rawDiffPts) >= 3 && avgPts !== null) {
    const direction = rawDiffPts > 0 ? 'over' : 'under';
    sentences.push(
      `The team delivered ${totalPts} points, ${Math.abs(rawDiffPts)} ${direction} the usual average of ${avgPts}.`
    );
  } else if (avgPts !== null) {
    sentences.push(
      `The team delivered ${totalPts} points, in line with the usual average of ${avgPts}.`
    );
  } else {
    sentences.push(`The team completed ${totalPts} points this sprint.`);
  }

  // Sentence 2: Capacity context (PTO, holidays, carry-over)
  const capacityNotes: string[] = [];
  if (daysLost > 0) {
    capacityNotes.push(
      `a shortened sprint (${capacity.effectiveSprintDays} of ${capacity.defaultWorkingDays} days)`
    );
  }
  if (totalPtoDays > 0) {
    capacityNotes.push(
      `${totalPtoDays} engineer-day${totalPtoDays !== 1 ? 's' : ''} of PTO`
    );
  }
  if (carryOverRatio > 0.25) {
    capacityNotes.push('a heavy carry-over load from the previous sprint');
  }
  if (capacityNotes.length > 0) {
    sentences.push(`The team navigated ${capacityNotes.join(' and ')}.`);
  }

  // Sentence 3 (conditional): IT volume as background pressure
  const fallbackItTickets = tickets.filter((t) => t.project === 'IT');
  const fallbackItCount = fallbackItTickets.length;
  const fallbackItHistoryCounts = recentSprints
    .map((s) => s.totalTickets ?? 0)
    .filter((n) => n > 0);
  const fallbackItAvg = fallbackItHistoryCounts.length > 0
    ? Math.round(fallbackItHistoryCounts.reduce((a, b) => a + b, 0) / fallbackItHistoryCounts.length)
    : null;
  if (fallbackItAvg !== null && fallbackItAvg > 0) {
    const fallbackItDelta = fallbackItCount - fallbackItAvg;
    if (fallbackItDelta > fallbackItAvg * 0.2) {
      sentences.push(
        `IT helpdesk volume ran high at ${fallbackItCount} tickets (${fallbackItDelta} above the usual ${fallbackItAvg}), adding background pressure on the team's bandwidth.`
      );
    }
  }

  // Optional one-line platform mention (only if highly dominant) — kept last so it reads as framing, not recap
  if (dominantPlatform) {
    sentences.push(`The bulk of investment went to ${dominantPlatform}.`);
  }

  return { text: sentences.join(' '), source: 'fallback' as const };
}

// ── Slide 3: Features & Fixes (LLM-assisted) ────────────────────────

const SLIDE3_SYSTEM_PROMPT = `You write concise feature/fix summaries for sprint demo deck slides.

IMPORTANT: Synthesize and consolidate related tickets into themes. Do NOT list every ticket summary verbatim.
- If a platform has many tickets, distill them into 1-2 high-level themes (e.g. "integration and deployment readiness" instead of listing each migration/API/UI task).
- Prioritize higher-point tickets — they represent the biggest work items.
- Small tickets (1-2 pts) can be omitted or folded into a broader theme.
- Platforms with only 1 small ticket can be dropped entirely if not noteworthy.

Style guide (from 38+ actual sprint decks):
- One line per platform, separated by newlines.
- Features: "CEM Collect: Delivered X and completed Y (CP-XXXX, CP-YYYY)."
- Fixes: "Survey: Resolved X and fixed Y (CP-XXXX)."
- Past tense verbs: Delivered, Completed, Implemented, Advanced, Resolved, Fixed, Addressed
- Keep each platform line to 1-2 sentences max.
- Include ticket keys in parentheses at the end of each line.
- Do NOT use bullet points, dashes, or numbered lists.
- Use the exact platform names provided in the input — do NOT rename or abbreviate them.

Example — many tickets consolidated into themes:
CEM Collect: Delivered integration with CEM Portal and Identity Server, completed DB migration setup, and refined the Analyst View for roster management (CP-3146, CP-3147, CP-3080, CP-3078, CP-3042).
Survey: Advanced multi-language support with locale-specific validation (CP-3020, CP-3022).
CEM Query: Implemented automated document ingestion pipeline from Portal to CEM Query Admin (CP-2349).`;

interface PlatformGroup {
  platform: string;
  totalPoints: number;
  tickets: Array<{ key: string; summary: string; points: number }>;
}

// Display-name overrides used only in demo deck output (not elsewhere in the app)
// (CEMQ/CEMQuery already resolve to "CEM Query" via labels.ts display names.)
const DEMO_DECK_PLATFORM_NAMES: Record<string, string> = {
  'Template Safari': 'CEM Collect',
};

function toDemoDeckPlatformName(platform: string): string {
  return DEMO_DECK_PLATFORM_NAMES[platform] ?? platform;
}

function groupTicketsByPlatform(tickets: Ticket[]): PlatformGroup[] {
  const groups = new Map<string, Array<{ key: string; summary: string; points: number }>>();

  for (const t of tickets) {
    const platform = toDemoDeckPlatformName(getPrimaryPlatform(t.labels));
    if (!groups.has(platform)) groups.set(platform, []);
    groups.get(platform)!.push({ key: t.key, summary: t.summary, points: t.points });
  }

  return [...groups.entries()]
    .sort((a, b) => {
      const ptsA = a[1].reduce((s, t) => s + t.points, 0);
      const ptsB = b[1].reduce((s, t) => s + t.points, 0);
      return ptsB - ptsA;
    })
    .map(([platform, tickets]) => ({
      platform,
      totalPoints: tickets.reduce((s, t) => s + t.points, 0),
      tickets: tickets.sort((a, b) => b.points - a.points),
    }));
}

function buildFallbackLines(groups: PlatformGroup[]): string {
  return groups
    .filter((g) => g.totalPoints > 0 || g.tickets.length > 1)
    .map((g) => {
      // Show top 3 tickets by points to keep it concise
      const top = g.tickets.slice(0, 3);
      const summaries = top.map((t) => t.summary).join('; ');
      const keys = g.tickets.map((t) => t.key).join(', ');
      const suffix = g.tickets.length > 3 ? ` and ${g.tickets.length - 3} more` : '';
      return `${g.platform}: ${summaries}${suffix} (${keys}).`;
    })
    .join('\n');
}

export async function generateSlide3Content(
  tickets: Ticket[]
): Promise<{ features: GeneratedText; fixes: GeneratedText }> {
  // Exclude Recurring tickets (week-by-week work not relevant to sprint demos)
  const cpTickets = tickets.filter(
    (t) => t.project === 'CP' && !t.labels.includes('Recurring')
  );

  // Split into features vs fixes
  const featureTickets = cpTickets.filter(
    (t) => t.type !== 'Bug' && !t.labels.includes('Hotfix')
  );
  const fixTickets = cpTickets.filter(
    (t) => t.type === 'Bug' || t.labels.includes('Hotfix')
  );

  const featureGroups = groupTicketsByPlatform(featureTickets);
  const fixGroups = groupTicketsByPlatform(fixTickets);

  // Generate features
  let features: GeneratedText = { text: '', source: 'fallback' };
  if (featureGroups.length > 0) {
    const featureContext = featureGroups
      .map((g) => {
        const items = g.tickets
          .map((t) => `  - ${t.key} (${t.points} pts): ${t.summary}`)
          .join('\n');
        return `${g.platform} (${g.totalPoints} pts total):\n${items}`;
      })
      .join('\n\n');

    const featureResult = await generateText(
      SLIDE3_SYSTEM_PROMPT,
      `Write "Key Features" lines for these completed tickets. Consolidate related work into themes and prioritize high-point items:\n\n${featureContext}`
    );
    features = featureResult
      ? { text: featureResult, source: 'ai' }
      : { text: buildFallbackLines(featureGroups), source: 'fallback' };
  }

  // Generate fixes
  let fixes: GeneratedText = { text: '', source: 'fallback' };
  if (fixGroups.length > 0) {
    const fixContext = fixGroups
      .map((g) => {
        const items = g.tickets
          .map((t) => `  - ${t.key} (${t.points} pts): ${t.summary}`)
          .join('\n');
        return `${g.platform} (${g.totalPoints} pts total):\n${items}`;
      })
      .join('\n\n');

    const fixResult = await generateText(
      SLIDE3_SYSTEM_PROMPT,
      `Write "Key Fixes" lines for these resolved bugs/hotfixes. Consolidate related work into themes and prioritize high-point items:\n\n${fixContext}`
    );
    fixes = fixResult
      ? { text: fixResult, source: 'ai' }
      : { text: buildFallbackLines(fixGroups), source: 'fallback' };
  }

  return { features, fixes };
}

// ── Demo Candidates (LLM-assisted) ───────────────────────────────────

const DEMO_CANDIDATES_SYSTEM_PROMPT = `You curate a list of demo-worthy tickets for a sprint review meeting.

Given a grouped list of completed tickets, select the ones most worth demoing and rewrite their summaries to be demo-friendly (clear, concise, audience-appropriate for stakeholders).

Demo-worthy means VISUALLY DEMONSTRABLE to a non-technical audience. Prioritize:
- UI changes, new screens, new user-facing flows
- Visible branding, layout, or form changes
- Features end-users or clients interact with directly
- Bug fixes that caused visible problems for real users (e.g. data not saving, broken exports)

DROP tickets that are NOT demo-friendly, including:
- Audit logs, change logs, activity tracking (backend, not visual)
- Database tables, config tables, migrations (infrastructure)
- Startup guards, health checks, dependency validation (ops)
- Internal tooling, refactors, code cleanup
- Readme updates, deployment tasks
- Hotfixes that only affect internal systems

Rules:
- Keep the exact output format: platform name on its own line, then ticket lines below it.
- Each ticket line: "CP-XXXX (Npts) — Demo-friendly summary"
- Rewrite JIRA-style summaries into plain language a non-technical stakeholder would understand (e.g. "Add validation to mandate lifecycle Excel export" → "Excel exports now validate mandate lifecycle rules before generating").
- Keep platform grouping and points-descending order intact.
- If a platform has no demo-worthy tickets after filtering, drop the entire platform group.
- Do NOT add commentary, headers, or bullet points — just the formatted list.`;

function buildDemoCandidatesFallback(groups: PlatformGroup[]): string {
  return groups
    .map((g) => {
      const lines = g.tickets.map(
        (t) => `${t.key} (${t.points}pts) — ${t.summary}`
      );
      return `${g.platform}\n${lines.join('\n')}`;
    })
    .join('\n\n');
}

export async function generateDemoCandidates(
  tickets: Ticket[]
): Promise<GeneratedText> {
  const candidates = tickets.filter(
    (t) =>
      t.project === 'CP' &&
      !t.labels.includes('Recurring') &&
      getPrimaryPlatform(t.labels) !== 'Other'
  );

  const groups = groupTicketsByPlatform(candidates);

  if (groups.length === 0) {
    return { text: '', source: 'fallback' };
  }

  const context = groups
    .map((g) => {
      const items = g.tickets
        .map((t) => `  ${t.key} (${t.points}pts) — ${t.summary}`)
        .join('\n');
      return `${g.platform} (${g.totalPoints} pts total):\n${items}`;
    })
    .join('\n\n');

  const result = await generateText(
    DEMO_CANDIDATES_SYSTEM_PROMPT,
    `Select and rewrite the most demo-worthy tickets from this sprint:\n\n${context}`
  );

  if (result) return { text: result, source: 'ai' };

  return { text: buildDemoCandidatesFallback(groups), source: 'fallback' };
}
