import { JIRA_CONFIG, JIRA_ENDPOINTS } from '../config/jira';
import { findMemberByAccountId } from '../config/team';
import { getStatusConfig } from '../config/statuses';
import { categorizeLabels } from '../config/labels';
import { calculateStatusDuration, extractPointChange } from '../utils/dateUtils';
import type {
  Sprint,
  Ticket,
  TicketType,
  Priority,
  Project,
  ChangelogEntry,
  JiraIssueRaw,
  JiraUserRaw,
  JiraSprintRaw,
} from '../types';

// Use proxy in development, direct URL in production
const API_BASE = import.meta.env.DEV ? '/jira-api' : JIRA_CONFIG.baseUrl;

// Get auth credentials from environment (only needed in production)
function getAuthHeader(): string | null {
  // In dev mode, the proxy adds auth
  if (import.meta.env.DEV) return null;

  const email = import.meta.env.VITE_JIRA_EMAIL;
  const token = import.meta.env.VITE_JIRA_API_TOKEN;

  if (!email || !token) {
    throw new Error('JIRA credentials not configured. Check your .env file.');
  }

  return `Basic ${btoa(`${email}:${token}`)}`;
}

// Base fetch with auth and error handling
async function jiraFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'X-Atlassian-Token': 'no-check',
    ...options.headers,
  };

  // Add auth header only in production
  const auth = getAuthHeader();
  if (auth) {
    (headers as Record<string, string>)['Authorization'] = auth;
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'omit', // Don't send cookies to avoid XSRF issues
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `JIRA API error (${response.status}): ${errorText}`
    );
  }

  return response.json();
}

// Fields worth showing in the changelog UI
const CHANGELOG_FIELDS = new Set([
  'status', 'Story Points', 'priority', 'assignee',
  'Developer', 'Reviewer', 'labels',
]);

// Extract curated changelog entries from raw JIRA changelog
function extractChangelog(changelog?: { histories: Array<{ created: string; items: Array<{ field: string; fieldtype: string; fromString: string | null; toString: string | null }> }> }): ChangelogEntry[] | undefined {
  if (!changelog?.histories?.length) return undefined;

  const entries: ChangelogEntry[] = [];
  for (const history of changelog.histories) {
    for (const item of history.items) {
      if (CHANGELOG_FIELDS.has(item.field)) {
        entries.push({
          timestamp: history.created,
          field: item.field,
          from: item.fromString,
          to: item.toString,
        });
      }
    }
  }

  if (entries.length === 0) return undefined;

  // Sort chronologically
  entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return entries;
}

// Pick the largest readily-available avatar (48px) from a JIRA user's avatarUrls map.
function pickAvatarUrl(user: { avatarUrls?: Record<string, string> } | null | undefined): string | undefined {
  const urls = user?.avatarUrls;
  if (!urls) return undefined;
  return urls['48x48'] ?? urls['32x32'] ?? urls['24x24'] ?? Object.values(urls)[0];
}

// Accumulates accountId → avatarUrl for every JIRA user seen across all fetched
// tickets (known team members and not). Used to auto-fill missing member avatars
// so nobody has to paste a URL by hand. Exposed via getAvatarMap().
const avatarRegistry = new Map<string, string>();

function registerAvatar(user: JiraUserRaw | null | undefined): void {
  if (!user?.accountId) return;
  const url = pickAvatarUrl(user);
  if (url) avatarRegistry.set(user.accountId, url);
}

/** Snapshot of all accountId → avatarUrl pairs harvested from fetched tickets. */
export function getAvatarMap(): Record<string, string> {
  return Object.fromEntries(avatarRegistry);
}

// Transform raw JIRA issue to app format
function transformIssue(raw: JiraIssueRaw, sprintId: string): Ticket {
  const developerField = raw.fields.customfield_10124;
  const reviewerField = raw.fields.customfield_10058;
  const assigneeField = raw.fields.assignee;

  // Track accountIds of people on this ticket who aren't in the team roster.
  // The Team Settings modal uses these to suggest new members for one-click add.
  const unknownParticipants: Ticket['unknownParticipants'] = [];

  // Handle multiple developers (customfield_10124 is an array)
  const developers: string[] = [];
  const developerNames: string[] = [];

  if (developerField && Array.isArray(developerField)) {
    developerField.forEach(dev => {
      registerAvatar(dev);
      const member = findMemberByAccountId(dev.accountId);
      if (member) {
        developers.push(member.id);
        developerNames.push(member.name);
      } else if (dev.displayName) {
        // Non-team member, use display name as ID
        developers.push(dev.displayName);
        developerNames.push(dev.displayName);
        if (dev.accountId) {
          unknownParticipants.push({ accountId: dev.accountId, displayName: dev.displayName, role: 'developer', avatarUrl: pickAvatarUrl(dev) });
        }
      }
    });
  }

  // Backwards compatibility: keep first developer as singular fields
  const developer = developers[0] ?? null;
  const developerName = developerNames[0] ?? null;

  // Handle reviewers (can be single or array, plus extract from changelog)
  const reviewers: string[] = [];
  const reviewerNames: string[] = [];
  const reviewerAccountIds = new Set<string>();

  // Handle reviewer field (might be single object or array)
  if (reviewerField) {
    const reviewerArray = Array.isArray(reviewerField) ? reviewerField : [reviewerField];
    reviewerArray.forEach(rev => {
      if (rev?.accountId) {
        registerAvatar(rev);
        reviewerAccountIds.add(rev.accountId);
        const member = findMemberByAccountId(rev.accountId);
        if (member) {
          reviewers.push(member.id);
          reviewerNames.push(member.name);
        } else if (rev.displayName) {
          reviewers.push(rev.displayName);
          reviewerNames.push(rev.displayName);
          unknownParticipants.push({ accountId: rev.accountId, displayName: rev.displayName, role: 'reviewer', avatarUrl: pickAvatarUrl(rev) });
        }
      }
    });
  }

  // Snapshot of field-only reviewers (before changelog additions)
  const fieldReviewers = [...reviewers];

  // Also extract reviewers from changelog (who transitioned to/from "Reviewing" status)
  if (raw.changelog?.histories) {
    for (const history of raw.changelog.histories) {
      for (const item of history.items) {
        if (item.field === 'status' &&
            (item.toString === 'Reviewing' || item.fromString === 'Reviewing')) {
          // Find who made this status change
          const author = (history as any).author;
          if (author?.accountId && !reviewerAccountIds.has(author.accountId)) {
            reviewerAccountIds.add(author.accountId);
            const member = findMemberByAccountId(author.accountId);
            if (member) {
              reviewers.push(member.id);
              reviewerNames.push(member.name);
            }
          }
        }
      }
    }
  }

  // Backwards compatibility: keep first reviewer as singular fields
  const reviewer = reviewers[0] ?? null;
  const reviewerName = reviewerNames[0] ?? null;

  // Assignee (for IT tickets)
  registerAvatar(assigneeField);
  const assigneeAccountId = assigneeField?.accountId ?? null;
  const assigneeMember = findMemberByAccountId(assigneeAccountId);
  if (assigneeAccountId && !assigneeMember && assigneeField?.displayName) {
    unknownParticipants.push({ accountId: assigneeAccountId, displayName: assigneeField.displayName, role: 'assignee', avatarUrl: pickAvatarUrl(assigneeField) });
  }

  // Determine project from key prefix
  const project: Project = raw.key.startsWith('IT') ? 'IT' : 'CP';

  // Get status configuration for this project type
  const statusConfig = getStatusConfig(project);

  // Calculate status durations from changelog using project-specific status names
  const inProgressDuration = calculateStatusDuration(
    raw.changelog,
    statusConfig.inProgress,
    raw.key
  );
  const inReviewDuration = calculateStatusDuration(
    raw.changelog,
    statusConfig.inReview,
    raw.key
  );

  // Extract point changes from changelog
  const pointChange = extractPointChange(raw.changelog, raw.key);

  // Extract curated changelog entries
  const changelog = extractChangelog(raw.changelog);

  // Detect carry-over: ticket was in a previous sprint if any sprint ID < current
  const sprintField = raw.fields.customfield_10020;
  const currentSprintId = parseInt(sprintId);
  const isCarryOver = Array.isArray(sprintField) &&
    sprintField.some(s => s.id < currentSprintId);

  // Categorize labels
  const labels = raw.fields.labels ?? [];
  const categorizedLabels = categorizeLabels(labels);

  return {
    key: raw.key,
    summary: raw.fields.summary,
    type: raw.fields.issuetype.name as TicketType,
    priority: raw.fields.priority.name as Priority,
    points: raw.fields.customfield_10031 ?? 0,
    developers,
    developerNames,
    developer,       // Backwards compat
    developerName,   // Backwards compat
    reviewers,
    reviewerNames,
    fieldReviewers,
    reviewer,        // Backwards compat
    reviewerName,    // Backwards compat
    assignee: assigneeMember?.id ?? null,
    project,
    status: raw.fields.status?.name,
    labels,
    categorizedLabels,
    inProgressDuration,
    inReviewDuration,
    pointChange,
    changelog,
    isCarryOver,
    unknownParticipants: unknownParticipants.length > 0 ? unknownParticipants : undefined,
  };
}

// Transform raw JIRA sprint to app format
function transformSprint(raw: JiraSprintRaw): Sprint {
  return {
    id: raw.id.toString(),
    name: raw.name,
    state: raw.state as Sprint['state'],
    startDate: raw.startDate,
    endDate: raw.endDate || raw.completeDate,
  };
}

// Fetch available sprints from board (with pagination)
export async function fetchSprints(
  state: 'active' | 'closed' | 'active,closed' = 'active,closed'
): Promise<Sprint[]> {
  const allSprints: JiraSprintRaw[] = [];
  let startAt = 0;
  const maxResults = 50;
  let hasMore = true;

  // Paginate through all sprints
  while (hasMore) {
    const endpoint = `${JIRA_ENDPOINTS.sprints(JIRA_CONFIG.boardId)}?state=${state}&maxResults=${maxResults}&startAt=${startAt}`;
    const data = await jiraFetch<{ values: JiraSprintRaw[]; isLast: boolean }>(endpoint);

    allSprints.push(...data.values);
    hasMore = !data.isLast;
    startAt += maxResults;
  }

  return allSprints
    .map(transformSprint)
    .sort((a, b) => {
      // Active sprints first
      if (a.state === 'active' && b.state !== 'active') return -1;
      if (b.state === 'active' && a.state !== 'active') return 1;
      // Extract sprint number from name (e.g., "Engineering Sprint 55" -> 55)
      const getSprintNum = (name: string) => {
        const match = name.match(/Sprint\s+(\d+)/i);
        return match ? parseInt(match[1]) : 0;
      };
      // Sort by sprint number descending (most recent first)
      return getSprintNum(b.name) - getSprintNum(a.name);
    });
}

// Fetch issues for a sprint using Search API
export async function fetchSprintIssues(sprintId: string, sprintState: string = 'closed'): Promise<Ticket[]> {
  const fields = JIRA_CONFIG.issueFields;
  const isActive = sprintState === 'active';

  // Active sprint: only exclude tickets moved to future sprints
  // Closed/other sprints: exclude tickets carried over to open or future sprints
  const carryOverFilter = isActive
    ? 'sprint NOT IN futureSprints()'
    : 'sprint NOT IN openSprints() AND sprint NOT IN futureSprints()';

  // Terminal statuses that should never count as completed work
  const excludeStatuses = 'status NOT IN ("Will Not Implement", "IT - Canceled")';

  // Fetch CP tickets (completed, not carried over, excluding terminal statuses)
  const cpJql = `project = CP AND sprint = ${sprintId} AND ${carryOverFilter} AND statusCategory = Done AND ${excludeStatuses}`;
  const cpParams = new URLSearchParams({
    jql: cpJql,
    fields: fields.join(','),
    expand: 'changelog',
    maxResults: '200',
  });
  const cpEndpoint = `${JIRA_ENDPOINTS.search}?${cpParams.toString()}`;
  const cpData = await jiraFetch<{ issues: JiraIssueRaw[]; total: number }>(cpEndpoint);

  // Fetch IT tickets (completed, not carried over, excluding terminal statuses)
  const itJql = `project = IT AND sprint = ${sprintId} AND ${carryOverFilter} AND statusCategory = Done AND ${excludeStatuses}`;
  const itParams = new URLSearchParams({
    jql: itJql,
    fields: fields.join(','),
    expand: 'changelog',
    maxResults: '200',
  });
  const itEndpoint = `${JIRA_ENDPOINTS.search}?${itParams.toString()}`;
  const itData = await jiraFetch<{ issues: JiraIssueRaw[]; total: number }>(itEndpoint);

  // Combine and transform
  const allIssues = [...cpData.issues, ...itData.issues];
  const tickets = allIssues.map(raw => transformIssue(raw, sprintId));

  // Only count a ticket in the last sprint it appeared in (highest sprint ID).
  // This prevents double-counting when a ticket carries over to a later sprint.
  const currentId = parseInt(sprintId);
  return tickets.filter((_, index) => {
    const sprintField = allIssues[index].fields.customfield_10020;
    if (!Array.isArray(sprintField) || sprintField.length <= 1) return true;
    const maxSprintId = Math.max(...sprintField.map(s => s.id));
    return maxSprintId <= currentId;
  });
}

// Fetch CP tickets that were in this sprint but carried OUT to a later sprint
// (unfinished here). These are excluded from fetchSprintIssues' completed set, so
// an engineer's in-sprint effort on them would otherwise be invisible when the
// sprint is reviewed after close. Returned tickets are flagged `carriedForward`.
export async function fetchCarriedOverIssues(sprintId: string): Promise<Ticket[]> {
  const fields = JIRA_CONFIG.issueFields;
  const excludeStatuses = 'status NOT IN ("Will Not Implement", "IT - Canceled")';

  // All CP tickets that were ever assigned to this sprint (completed or not).
  const jql = `project = CP AND sprint = ${sprintId} AND ${excludeStatuses}`;
  const params = new URLSearchParams({
    jql,
    fields: fields.join(','),
    expand: 'changelog',
    maxResults: '200',
  });
  const endpoint = `${JIRA_ENDPOINTS.search}?${params.toString()}`;
  const data = await jiraFetch<{ issues: JiraIssueRaw[]; total: number }>(endpoint);

  const currentId = parseInt(sprintId);

  // Keep only tickets whose latest sprint is AFTER this one — i.e. they left this
  // sprint unfinished and continued elsewhere. (maxSprintId <= currentId means the
  // ticket finished here and is already in the completed set.)
  return data.issues
    .filter((raw) => {
      const sprintField = raw.fields.customfield_10020;
      if (!Array.isArray(sprintField) || sprintField.length === 0) return false;
      const maxSprintId = Math.max(...sprintField.map((s) => s.id));
      return maxSprintId > currentId;
    })
    .map((raw) => ({ ...transformIssue(raw, sprintId), carriedForward: true }));
}

// ── Burn-up series ──────────────────────────────────────────────────────
// Reconstructs, per calendar day of the sprint, the dynamic scope (committed
// points, stepping as items are added/removed/re-pointed) and cumulative
// completed points (day a ticket last transitioned into its final Done status).

type RawHistory = { created: string; items: Array<{ field: string; fromString: string | null; toString: string | null }> };

// All "Sprint <n>" numbers mentioned in a changelog value string (names or ids).
function sprintNumsIn(value: string | null): number[] {
  if (!value) return [];
  const nums: number[] = [];
  const re = /Sprint\s+(\d+)/gi;
  let m;
  while ((m = re.exec(value)) !== null) nums.push(parseInt(m[1], 10));
  return nums;
}

function buildBurnUp(raw: JiraIssueRaw[], sprintNum: number, startDate: string, endDate: string): import('../types').BurnUpPoint[] {
  // Status names that belong to the Done category (derived from the result set,
  // since the changelog only records status names, not categories). e.g.
  // "Done", "Deployed to Staging", "Live".
  const doneNames = new Set<string>();
  for (const issue of raw) {
    if (issue.fields.status?.statusCategory?.name === 'Done' && issue.fields.status.name) {
      doneNames.add(issue.fields.status.name);
    }
  }

  // Scope-change events, bucketed by the day they happened (within the window).
  const startD0 = new Date(startDate);
  const endD0 = new Date(endDate);
  // Exclude the start day: everything committed at sprint start is initial scope,
  // not a mid-sprint change. Markers should only flag scope changes AFTER that.
  const startDayEndMs = new Date(startD0.getFullYear(), startD0.getMonth(), startD0.getDate(), 23, 59, 59, 999).getTime();
  const endMs = new Date(endD0.getFullYear(), endD0.getMonth(), endD0.getDate(), 23, 59, 59, 999).getTime();
  const dayKey = (ms: number) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const eventsByDay = new Map<string, import('../types').ScopeChange[]>();
  const record = (ms: number, ch: import('../types').ScopeChange) => {
    if (ms <= startDayEndMs || ms > endMs) return; // ignore initial commitment + post-end noise
    const k = dayKey(ms);
    if (!eventsByDay.has(k)) eventsByDay.set(k, []);
    eventsByDay.get(k)!.push(ch);
  };

  // Per-ticket reconstruction
  const tickets = raw.map((issue) => {
    const histories: RawHistory[] = (issue.changelog?.histories ?? [])
      .slice()
      .sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime()) as unknown as RawHistory[];

    // Story Points timeline
    const spChanges = histories
      .flatMap((h) => h.items.filter((i) => i.field === 'Story Points').map((i) => ({ t: h.created, to: parseFloat(i.toString ?? '') , from: parseFloat(i.fromString ?? '') })));
    const currentPoints = issue.fields.customfield_10031 ?? 0;
    const pointsAt = (dayEnd: number): number => {
      if (spChanges.length === 0) return currentPoints;
      let val = isNaN(spChanges[0].from) ? 0 : spChanges[0].from;
      for (const c of spChanges) {
        if (new Date(c.t).getTime() <= dayEnd) val = isNaN(c.to) ? val : c.to;
        else break;
      }
      return val;
    };

    // Sprint membership timeline for THIS sprint (by sprint number)
    const sprintChanges = histories
      .filter((h) => h.items.some((i) => i.field === 'Sprint'))
      .map((h) => {
        const item = h.items.find((i) => i.field === 'Sprint')!;
        return { t: h.created, after: sprintNumsIn(item.toString).includes(sprintNum), before: sprintNumsIn(item.fromString).includes(sprintNum) };
      });
    const memberAt = (dayEnd: number): boolean => {
      if (sprintChanges.length === 0) return true; // assume member for the whole window
      let last: { t: string; after: boolean; before: boolean } | null = null;
      for (const c of sprintChanges) {
        if (new Date(c.t).getTime() <= dayEnd) last = c; else break;
      }
      return last ? last.after : sprintChanges[0].before;
    };

    // Completion (Jira-like): the FIRST time the ticket entered any Done-category
    // status. Only meaningful if it's currently Done-category.
    let completionTime: number | null = null;
    if (issue.fields.status?.statusCategory?.name === 'Done') {
      for (const h of histories) {
        if (h.items.some((i) => i.field === 'status' && i.toString && doneNames.has(i.toString))) {
          completionTime = new Date(h.created).getTime();
          break; // first entry into a Done status
        }
      }
      if (completionTime === null && issue.fields.resolutiondate) {
        completionTime = new Date(issue.fields.resolutiondate).getTime();
      }
    }

    // Emit scope-change events (added / removed / re-pointed) for the markers.
    for (const c of sprintChanges) {
      const t = new Date(c.t).getTime();
      if (!c.before && c.after) record(t, { key: issue.key, kind: 'added', delta: pointsAt(t) });
      else if (c.before && !c.after) record(t, { key: issue.key, kind: 'removed', delta: -pointsAt(t) });
    }
    for (const c of spChanges) {
      if (isNaN(c.from) || isNaN(c.to) || c.from === c.to) continue;
      const t = new Date(c.t).getTime();
      if (memberAt(t)) record(t, { key: issue.key, kind: 'repointed', delta: c.to - c.from, from: c.from, to: c.to });
    }

    return { pointsAt, memberAt, completionTime };
  });

  // Day-by-day
  const points: import('../types').BurnUpPoint[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const now = Date.now();
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  while (cursor <= last) {
    const dayEnd = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 23, 59, 59, 999).getTime();
    let scope = 0;
    let completed = 0;
    for (const t of tickets) {
      if (t.memberAt(dayEnd)) scope += t.pointsAt(dayEnd);
      if (t.completionTime !== null && t.completionTime <= dayEnd && t.memberAt(t.completionTime)) {
        completed += t.pointsAt(t.completionTime);
      }
    }
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    points.push({
      date: iso,
      label: cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      scope: Math.round(scope * 10) / 10,
      // Don't draw completed into the future for active sprints
      completed: dayEnd <= now + 86400000 ? Math.round(completed * 10) / 10 : NaN,
      isToday: now >= new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()).getTime() && now <= dayEnd,
      scopeChanges: eventsByDay.get(iso),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return points;
}

export async function fetchBurnUpSeries(
  sprintId: string,
  sprintName: string,
  startDate: string,
  endDate: string
): Promise<import('../types').BurnUpPoint[]> {
  if (!startDate || !endDate) return [];
  const sprintNum = (() => { const m = /Sprint\s+(\d+)/i.exec(sprintName); return m ? parseInt(m[1], 10) : NaN; })();
  if (isNaN(sprintNum)) return [];

  const excludeStatuses = 'status NOT IN ("Will Not Implement", "IT - Canceled")';
  const jql = `project = CP AND sprint = ${sprintId} AND ${excludeStatuses}`;
  const params = new URLSearchParams({
    jql,
    fields: JIRA_CONFIG.issueFields.join(','),
    expand: 'changelog',
    maxResults: '200',
  });
  const data = await jiraFetch<{ issues: JiraIssueRaw[] }>(`${JIRA_ENDPOINTS.search}?${params.toString()}`);
  return buildBurnUp(data.issues, sprintNum, startDate, endDate);
}

// Fetch a single sprint by ID
export async function fetchSprintById(sprintId: string): Promise<Sprint | null> {
  try {
    const endpoint = `/rest/agile/1.0/sprint/${sprintId}`;
    const raw = await jiraFetch<JiraSprintRaw>(endpoint);
    return transformSprint(raw);
  } catch (error) {
    console.error(`Failed to fetch sprint ${sprintId}:`, error);
    return null;
  }
}

// Combined fetch for sprint data
export async function fetchSprintData(sprintId: string): Promise<{
  sprint: Sprint;
  tickets: Ticket[];
} | null> {
  try {
    // Fetch sprint first so we know its state for JQL filtering
    const sprint = await fetchSprintById(sprintId);

    if (!sprint) {
      throw new Error(`Sprint ${sprintId} not found`);
    }

    const tickets = await fetchSprintIssues(sprintId, sprint.state);
    return { sprint, tickets };
  } catch (error) {
    console.error('Failed to fetch sprint data:', error);
    throw error;
  }
}

// Fetch non-done tickets for the active sprint (In Progress, Reviewing, etc.)
export async function fetchActiveSprintInFlightTickets(sprintId: string): Promise<Ticket[]> {
  const fields = JIRA_CONFIG.issueFields;
  const excludeStatuses = 'status NOT IN ("Will Not Implement", "IT - Canceled")';
  const jql = `sprint = ${sprintId} AND sprint NOT IN futureSprints() AND statusCategory != Done AND ${excludeStatuses}`;

  const params = new URLSearchParams({
    jql,
    fields: fields.join(','),
    expand: 'changelog',
    maxResults: '200',
  });

  const endpoint = `${JIRA_ENDPOINTS.search}?${params.toString()}`;
  const data = await jiraFetch<{ issues: JiraIssueRaw[]; total: number }>(endpoint);

  return data.issues.map(raw => transformIssue(raw, sprintId));
}
