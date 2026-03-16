/**
 * Demo Deck Text Generator utilities.
 *
 * Two-phase generation:
 * 1. Deterministic (no LLM): slide2Summary, slide2Metrics
 * 2. LLM-assisted (async): slide2Narrative, slide3Features, slide3Fixes
 */

import type { Ticket, SprintData, SprintCapacity, EngineerTimeOff, SprintSummary } from '../types';
import { getPrimaryPlatform } from '../config/labels';
import { TEAM_MEMBERS } from '../config/team';
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

const NARRATIVE_SYSTEM_PROMPT = `You write sprint review narratives for an engineering team's demo deck.
Write 2-4 sentences that describe the sprint's focus and briefly characterize the work across platforms.

Rules:
- Use past tense. Be factual, concise, professional.
- Do NOT use bullet points. Write a short paragraph.
- Do NOT start with "During this sprint" — vary the opening.
- Always mention the major platforms and briefly characterize the KIND of work done on each (e.g. "lifecycle hardening", "deployment stabilization", "multi-language support") rather than just naming the platforms. Use the ticket summaries provided to identify themes.
- Keep it to 2-4 sentences total. Don't describe every ticket — synthesize into themes.
- If capacity, velocity, or carry-over are notable, weave them in naturally.

Here are real examples from past sprint decks to match the tone and content:

Example 1 (heavy single-platform sprint):
"This sprint was heavily weighted toward Template Safari, with most points focused on mandate lifecycle hardening, Excel generation, and deployment stabilization. There was also meaningful Survey work across both V1 and V2, plus a smaller but important set of CEMQ and infrastructure items, including hotfixes and production deployments."

Example 2 (capacity-impacted sprint):
"The team was down 1-2 engineers for most of the sprint due to PTO, leading to slightly lower story points than usual. Work was spread across Survey enhancements and Dashboard stability fixes, with a few carry-over items from the previous sprint."

Example 3 (strong sprint with carry-overs):
"Points completed were higher than average, likely due to semi-completed carry-over work from the previous sprint being closed out early. The team delivered Template Safari integration and migration work, Survey locale validation, and CEMQ document ingestion improvements."

Example 4 (short/holiday sprint):
"Short sprint due to the holidays — the team had only 7 effective working days. Despite the reduced capacity, the team completed a solid set of Dashboard reporting improvements and Survey accessibility fixes."

Example 5 (overcommitted sprint with scope creep):
"The team closed below our usual velocity this sprint, spread thin across Template Safari launch prep, Survey V2 enhancements, and ongoing CEMQ admin tooling. Steady scope creep from the Template Safari launch work contributed to the lower throughput."`;

export type GeneratedText = { text: string; source: 'ai' | 'fallback' };

export async function generateSlide2Narrative(
  sprint: SprintData,
  tickets: Ticket[],
  capacity: SprintCapacity,
  timeOff: Record<string, EngineerTimeOff>,
  recentSprints: SprintSummary[]
): Promise<GeneratedText> {
  const cpTickets = tickets.filter((t) => t.project === 'CP');

  // Top platforms by point total
  const platformPoints = new Map<string, number>();
  for (const t of cpTickets) {
    const plat = getPrimaryPlatform(t.labels);
    platformPoints.set(plat, (platformPoints.get(plat) ?? 0) + t.points);
  }
  const sortedPlatforms = [...platformPoints.entries()]
    .sort((a, b) => b[1] - a[1]);
  const topPlatforms = sortedPlatforms
    .slice(0, 4)
    .map(([name, pts]) => `${name} (${pts} pts)`);

  // Platform distribution percentages
  const totalPts = cpTickets.reduce((sum, t) => sum + t.points, 0);
  const platformPcts = sortedPlatforms.map(([name, pts]) => {
    const pct = totalPts > 0 ? Math.round((pts / totalPts) * 100) : 0;
    return { name, pts, pct };
  });
  const dominantPlatform = platformPcts.length > 0 && platformPcts[0].pct > 40
    ? platformPcts[0] : null;

  // PTO summary
  const ptoEngineers = TEAM_MEMBERS
    .filter((m) => timeOff[m.id] && timeOff[m.id].ptoDays > 0)
    .map((m) => `${m.name}: ${timeOff[m.id].ptoDays}d PTO`);
  const totalPtoDays = TEAM_MEMBERS.reduce(
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
  const velocityDiffPct = avgPts !== null && avgPts > 0
    ? Math.round(((totalPts - avgPts) / avgPts) * 100) : null;

  // Capacity shortfall
  const daysLost = capacity.defaultWorkingDays - capacity.effectiveSprintDays;

  // Per-platform ticket summaries for work theme characterization
  const platformTicketMap = new Map<string, Ticket[]>();
  for (const t of cpTickets) {
    const plat = getPrimaryPlatform(t.labels);
    if (!platformTicketMap.has(plat)) platformTicketMap.set(plat, []);
    platformTicketMap.get(plat)!.push(t);
  }
  const platformBreakdown = sortedPlatforms
    .map(([name]) => {
      const platTickets = platformTicketMap.get(name) ?? [];
      // Show top tickets by points to give the LLM material for theme characterization
      const top = [...platTickets]
        .sort((a, b) => b.points - a.points)
        .slice(0, 5)
        .map((t) => `${t.key} (${t.points}pts): ${t.summary}`);
      return `${name}:\n  ${top.join('\n  ')}`;
    })
    .join('\n');

  // Build enriched context for LLM
  const context = [
    `Sprint: ${sprint.name}`,
    `Top platforms: ${topPlatforms.join(', ')}`,
    `Platform distribution: ${platformPcts.map((p) => `${p.name} ${p.pct}%`).join(', ')}`,
    dominantPlatform
      ? `Dominant platform: ${dominantPlatform.name} at ${dominantPlatform.pct}% of points — sprint was heavily weighted toward this platform.`
      : 'Work was spread across multiple platforms — no single platform dominated.',
    `\nTickets by platform (use these to characterize the work themes):\n${platformBreakdown}`,
    `Total points completed: ${totalPts}${avgPts !== null ? ` (team avg: ${avgPts}, ${velocityDiffPct !== null && velocityDiffPct >= 0 ? '+' : ''}${velocityDiffPct}% ${velocityDiffPct !== null && velocityDiffPct >= 0 ? 'above' : 'below'} average)` : ''}`,
    `Effective sprint days: ${capacity.effectiveSprintDays} of ${capacity.defaultWorkingDays}${daysLost > 0 ? ` (${daysLost} day${daysLost !== 1 ? 's' : ''} lost to holidays)` : ''}`,
    totalPtoDays > 0
      ? `PTO impact: team was down ${totalPtoDays} engineer-day${totalPtoDays !== 1 ? 's' : ''} (${ptoEngineers.join('; ')})`
      : 'No PTO this sprint.',
    `Carry-over tickets: ${carryOverCount} of ${cpTickets.length} total${carryOverRatio > 0.25 ? ' — high carry-over ratio suggests overcommitment last sprint' : ''}`,
    `Team size: ${TEAM_MEMBERS.length} engineers`,
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
        const itPctDiff = Math.round(((itTicketCount - itHistoryAvg) / itHistoryAvg) * 100);
        const aboveBelow = itPctDiff >= 0 ? 'above' : 'below';
        const line = `IT Helpdesk tickets: ${itTicketCount} (avg: ${itHistoryAvg}, ${itPctDiff >= 0 ? '+' : ''}${itPctDiff}% ${aboveBelow} average)`;
        return itPctDiff > 20 ? `${line} — higher than usual IT volume` : line;
      }
      return `IT Helpdesk tickets: ${itTicketCount}`;
    })(),
  ].join('\n');

  const result = await generateText(NARRATIVE_SYSTEM_PROMPT, context);

  if (result) return { text: result, source: 'ai' as const };

  // ── Deterministic fallback: assemble 2-3 sentences from data ──

  const sentences: string[] = [];

  // Sentence 1: Platform focus
  const platNames = sortedPlatforms.map(([name]) => name);
  if (dominantPlatform && platNames.length > 1) {
    const others = platNames.slice(1, 3).join(' and ');
    sentences.push(
      `This sprint was heavily focused on ${dominantPlatform.name}, with additional work on ${others}.`
    );
  } else if (platNames.length > 0) {
    const listed = platNames.slice(0, 3).join(', ');
    sentences.push(`This sprint was primarily focused on ${listed}.`);
  }

  // Sentence 2 (conditional): Capacity note
  if (daysLost > 0 && totalPtoDays > 0) {
    sentences.push(
      `The team had a shortened sprint (${capacity.effectiveSprintDays} of ${capacity.defaultWorkingDays} days) and was down ${totalPtoDays} engineer-day${totalPtoDays !== 1 ? 's' : ''} due to PTO.`
    );
  } else if (daysLost > 0) {
    sentences.push(
      `The team had a shortened sprint with only ${capacity.effectiveSprintDays} effective working days due to holidays.`
    );
  } else if (totalPtoDays > 0) {
    sentences.push(
      `The team was down ${totalPtoDays} engineer-day${totalPtoDays !== 1 ? 's' : ''} due to PTO.`
    );
  }

  // Sentence 3 (conditional): Velocity note
  if (velocityDiffPct !== null && Math.abs(velocityDiffPct) >= 10) {
    if (velocityDiffPct > 0) {
      sentences.push(
        `Points completed (${totalPts}) were above the team's usual average of ${avgPts}.`
      );
    } else {
      sentences.push(
        `Points completed (${totalPts}) were below the team's usual average of ${avgPts}.`
      );
    }
  }

  // Sentence 4 (conditional): IT ticket volume note
  const fallbackItTickets = tickets.filter((t) => t.project === 'IT');
  const fallbackItCount = fallbackItTickets.length;
  const fallbackItHistoryCounts = recentSprints
    .map((s) => s.totalTickets ?? 0)
    .filter((n) => n > 0);
  const fallbackItAvg = fallbackItHistoryCounts.length > 0
    ? Math.round(fallbackItHistoryCounts.reduce((a, b) => a + b, 0) / fallbackItHistoryCounts.length)
    : null;
  if (fallbackItAvg !== null && fallbackItAvg > 0) {
    const fallbackItPct = Math.round(((fallbackItCount - fallbackItAvg) / fallbackItAvg) * 100);
    if (fallbackItPct > 20) {
      sentences.push(
        `IT ticket volume was higher than usual at ${fallbackItCount} (avg ${fallbackItAvg}), which may have impacted delivery capacity.`
      );
    }
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
- Features: "Template Safari: Delivered X and completed Y (CP-XXXX, CP-YYYY)."
- Fixes: "Survey: Resolved X and fixed Y (CP-XXXX)."
- Past tense verbs: Delivered, Completed, Implemented, Advanced, Resolved, Fixed, Addressed
- Keep each platform line to 1-2 sentences max.
- Include ticket keys in parentheses at the end of each line.
- Do NOT use bullet points, dashes, or numbered lists.

Example — many tickets consolidated into themes:
Template Safari: Delivered integration with CEM Portal and Identity Server, completed DB migration setup, and refined the Analyst View for roster management (CP-3146, CP-3147, CP-3080, CP-3078, CP-3042).
Survey: Advanced multi-language support with locale-specific validation (CP-3020, CP-3022).
CEMQ: Implemented automated document ingestion pipeline from Portal to CEMQ Admin (CP-2349).`;

interface PlatformGroup {
  platform: string;
  totalPoints: number;
  tickets: Array<{ key: string; summary: string; points: number }>;
}

function groupTicketsByPlatform(tickets: Ticket[]): PlatformGroup[] {
  const groups = new Map<string, Array<{ key: string; summary: string; points: number }>>();

  for (const t of tickets) {
    const platform = getPrimaryPlatform(t.labels);
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
