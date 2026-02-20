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

// Transform raw JIRA issue to app format
function transformIssue(raw: JiraIssueRaw, sprintId: string): Ticket {
  const developerField = raw.fields.customfield_10124;
  const reviewerField = raw.fields.customfield_10058;
  const assigneeField = raw.fields.assignee;

  // Handle multiple developers (customfield_10124 is an array)
  const developers: string[] = [];
  const developerNames: string[] = [];

  if (developerField && Array.isArray(developerField)) {
    developerField.forEach(dev => {
      const member = findMemberByAccountId(dev.accountId);
      if (member) {
        developers.push(member.id);
        developerNames.push(member.name);
      } else if (dev.displayName) {
        // Non-team member, use display name as ID
        developers.push(dev.displayName);
        developerNames.push(dev.displayName);
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
        reviewerAccountIds.add(rev.accountId);
        const member = findMemberByAccountId(rev.accountId);
        if (member) {
          reviewers.push(member.id);
          reviewerNames.push(member.name);
        } else if (rev.displayName) {
          reviewers.push(rev.displayName);
          reviewerNames.push(rev.displayName);
        }
      }
    });
  }

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
  const assigneeAccountId = assigneeField?.accountId ?? null;
  const assigneeMember = findMemberByAccountId(assigneeAccountId);

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
    reviewer,        // Backwards compat
    reviewerName,    // Backwards compat
    assignee: assigneeMember?.id ?? null,
    project,
    labels,
    categorizedLabels,
    inProgressDuration,
    inReviewDuration,
    pointChange,
    changelog,
    isCarryOver,
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
// sprintEndDate filters out tickets resolved after the sprint ended (carry-overs completed later)
export async function fetchSprintIssues(sprintId: string, sprintEndDate?: string): Promise<Ticket[]> {
  const fields = JIRA_CONFIG.issueFields;

  // Build resolution date filter: only include tickets resolved before sprint end + 1 day buffer
  // This prevents counting carry-over tickets that were completed in a later sprint
  let resolutionFilter = '';
  if (sprintEndDate) {
    // Add 1 day buffer for timezone edge cases
    const endDate = new Date(sprintEndDate);
    endDate.setDate(endDate.getDate() + 1);
    const endStr = endDate.toISOString().split('T')[0];
    resolutionFilter = ` AND resolutiondate <= "${endStr}"`;
  }

  // Fetch CP tickets (completed, not carried over)
  const cpJql = `project = CP AND sprint = ${sprintId} AND statusCategory = Done${resolutionFilter}`;
  const cpParams = new URLSearchParams({
    jql: cpJql,
    fields: fields.join(','),
    expand: 'changelog',
    maxResults: '200',
  });
  const cpEndpoint = `${JIRA_ENDPOINTS.search}?${cpParams.toString()}`;
  const cpData = await jiraFetch<{ issues: JiraIssueRaw[]; total: number }>(cpEndpoint);

  // Fetch IT tickets (completed, not carried over, excluding canceled)
  const itJql = `project = IT AND sprint = ${sprintId} AND statusCategory = Done AND status != "IT - Canceled"${resolutionFilter}`;
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

  return tickets;
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
    // Fetch sprint first to get end date for filtering
    const sprint = await fetchSprintById(sprintId);
    if (!sprint) {
      throw new Error(`Sprint ${sprintId} not found`);
    }

    const tickets = await fetchSprintIssues(sprintId, sprint.endDate);
    return { sprint, tickets };
  } catch (error) {
    console.error('Failed to fetch sprint data:', error);
    throw error;
  }
}
