/**
 * Demo Deck Text Generator utilities.
 *
 * Two-phase generation:
 * 1. Deterministic (no LLM): slide1, slide2Summary, slide2Metrics
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
  slide1: string;
  slide2Summary: string;
  slide2Metrics: string;
  slide2Narrative: string;
  slide3Features: string;
  slide3Fixes: string;
}

// ── Slide 1: Title ──────────────────────────────────────────────────

export function generateSlide1(sprint: SprintData): string {
  const num = extractSprintNumber(sprint.name);
  const dateStr = formatEndDate(sprint.date);
  return `Sprint ${num} Review — ${dateStr}`;
}

function extractSprintNumber(name: string): string {
  const match = name.match(/Sprint\s+(\d+)/i);
  return match ? match[1] : name;
}

function formatEndDate(dateIso: string): string {
  const d = new Date(dateIso);
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
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

  // IT average from recent sprints
  const itCounts = recentSprints
    .map((s) => s.totalTickets ?? 0)
    .filter((n) => n > 0);
  const itAvg = itCounts.length > 0
    ? Math.round(itCounts.reduce((a, b) => a + b, 0) / itCounts.length)
    : null;

  let cpLine = `${storyTaskCount} story tasks, ${bugCount} bug${bugCount !== 1 ? 's' : ''}`;
  let itLine = `${itCount} IT Helpdesk task${itCount !== 1 ? 's' : ''}`;

  if (itAvg !== null) {
    const diff = itCount - itAvg;
    const sign = diff >= 0 ? '+' : '';
    itLine += ` (prev ${itAvg}, ${sign}${diff} over avg)`;
  }

  return `${cpLine} + ${itLine}`;
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
Write 1-3 sentences that describe the sprint's focus, any capacity issues, and scope creep.

Style guide (from 38+ actual sprint decks):
- "This sprint was primarily focused on [platforms]..."
- "Despite being one engineer short, the team..."
- "Scope creep was steady/minimal."
- "The team maintained strong velocity despite [challenge]."
- Use past tense. Be factual, concise, professional.
- Do NOT use bullet points. Write a short paragraph.
- Do NOT start with "During this sprint" — vary the opening.`;

export async function generateSlide2Narrative(
  sprint: SprintData,
  tickets: Ticket[],
  capacity: SprintCapacity,
  timeOff: Record<string, EngineerTimeOff>,
  recentSprints: SprintSummary[]
): Promise<string> {
  const cpTickets = tickets.filter((t) => t.project === 'CP');

  // Top platforms by point total
  const platformPoints = new Map<string, number>();
  for (const t of cpTickets) {
    const plat = getPrimaryPlatform(t.labels);
    platformPoints.set(plat, (platformPoints.get(plat) ?? 0) + t.points);
  }
  const topPlatforms = [...platformPoints.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, pts]) => `${name} (${pts} pts)`);

  // PTO summary
  const ptoEngineers = TEAM_MEMBERS
    .filter((m) => timeOff[m.id] && timeOff[m.id].ptoDays > 0)
    .map((m) => `${m.name}: ${timeOff[m.id].ptoDays}d PTO`);

  // Carry-over count
  const carryOverCount = cpTickets.filter((t) => t.isCarryOver).length;

  // Total points vs recent average
  const totalPts = cpTickets.reduce((sum, t) => sum + t.points, 0);
  const recentPts = recentSprints
    .map((s) => s.totalPoints ?? 0)
    .filter((n) => n > 0);
  const avgPts = recentPts.length > 0
    ? Math.round(recentPts.reduce((a, b) => a + b, 0) / recentPts.length)
    : null;

  const context = [
    `Sprint: ${sprint.name}`,
    `Top platforms: ${topPlatforms.join(', ')}`,
    `Total points completed: ${totalPts}${avgPts !== null ? ` (avg: ${avgPts})` : ''}`,
    `Effective sprint days: ${capacity.effectiveSprintDays} (of ${capacity.defaultWorkingDays})`,
    ptoEngineers.length > 0 ? `PTO: ${ptoEngineers.join('; ')}` : 'No PTO this sprint.',
    `Carry-over tickets: ${carryOverCount}`,
    `Team size: ${TEAM_MEMBERS.length} engineers`,
  ].join('\n');

  const result = await generateText(NARRATIVE_SYSTEM_PROMPT, context);

  if (result) return result;

  // Fallback: template-based draft
  const platList = topPlatforms.slice(0, 3).map((p) => p.replace(/ \(\d+ pts\)/, '')).join(', ');
  return `This sprint was primarily focused on ${platList}. ${totalPts} points were delivered across the team.`;
}

// ── Slide 3: Features & Fixes (LLM-assisted) ────────────────────────

const SLIDE3_SYSTEM_PROMPT = `You write concise feature/fix summaries for sprint demo deck slides.

Style guide (from 38+ actual sprint decks):
- Group by platform, one line per platform.
- Features: "Template Safari: Delivered X, completed Y (CP-XXXX, CP-YYYY)."
- Fixes: "Survey: Resolved X, fixed Y (CP-XXXX)."
- Past tense verbs: Delivered, Completed, Implemented, Advanced, Resolved, Fixed, Addressed
- Keep each platform line to 1-2 sentences max.
- Always include ticket keys in parentheses at the end.
- If a platform has only one ticket, still write a polished sentence.

Example output:
Template Safari: Delivered new template comparison view and completed bulk upload validation (CP-3001, CP-3015).
Dashboard: Implemented real-time refresh for survey response charts (CP-2998).
Survey: Advanced multi-language support with locale-specific validation (CP-3020, CP-3022).`;

interface PlatformGroup {
  platform: string;
  tickets: Array<{ key: string; summary: string }>;
}

function groupTicketsByPlatform(tickets: Ticket[]): PlatformGroup[] {
  const groups = new Map<string, Array<{ key: string; summary: string }>>();

  for (const t of tickets) {
    const platform = getPrimaryPlatform(t.labels);
    if (!groups.has(platform)) groups.set(platform, []);
    groups.get(platform)!.push({ key: t.key, summary: t.summary });
  }

  return [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([platform, tickets]) => ({ platform, tickets }));
}

function buildFallbackLines(groups: PlatformGroup[]): string {
  return groups
    .map((g) => {
      const summaries = g.tickets.map((t) => t.summary).join('; ');
      const keys = g.tickets.map((t) => t.key).join(', ');
      return `${g.platform}: ${summaries} (${keys}).`;
    })
    .join('\n');
}

export async function generateSlide3Content(
  tickets: Ticket[]
): Promise<{ features: string; fixes: string }> {
  const cpTickets = tickets.filter((t) => t.project === 'CP');

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
  let features = '';
  if (featureGroups.length > 0) {
    const featureContext = featureGroups
      .map((g) => {
        const items = g.tickets
          .map((t) => `  - ${t.key}: ${t.summary}`)
          .join('\n');
        return `${g.platform}:\n${items}`;
      })
      .join('\n\n');

    const featureResult = await generateText(
      SLIDE3_SYSTEM_PROMPT,
      `Write "Key Features" lines for these completed tickets, grouped by platform:\n\n${featureContext}`
    );
    features = featureResult || buildFallbackLines(featureGroups);
  }

  // Generate fixes
  let fixes = '';
  if (fixGroups.length > 0) {
    const fixContext = fixGroups
      .map((g) => {
        const items = g.tickets
          .map((t) => `  - ${t.key}: ${t.summary}`)
          .join('\n');
        return `${g.platform}:\n${items}`;
      })
      .join('\n\n');

    const fixResult = await generateText(
      SLIDE3_SYSTEM_PROMPT,
      `Write "Key Fixes" lines for these resolved bugs/hotfixes, grouped by platform:\n\n${fixContext}`
    );
    fixes = fixResult || buildFallbackLines(fixGroups);
  }

  return { features, fixes };
}
