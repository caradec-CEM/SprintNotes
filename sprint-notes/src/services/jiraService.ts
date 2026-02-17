import { JIRA_CONFIG, JIRA_ENDPOINTS } from '../config/jira';
import { findMemberByAccountId } from '../config/team';
import { getStatusConfig } from '../config/statuses';
import { categorizeLabels } from '../config/labels';
import { calculateStatusDuration } from '../utils/dateUtils';
import type {
  Sprint,
  Ticket,
  TicketType,
  Priority,
  Project,
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

// Transform raw JIRA issue to app format
function transformIssue(raw: JiraIssueRaw): Ticket {
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
export async function fetchSprintIssues(sprintId: string): Promise<Ticket[]> {
  const fields = JIRA_CONFIG.issueFields;

  // Fetch CP tickets (completed, not carried over)
  const cpJql = `project = CP AND sprint = ${sprintId} AND sprint NOT IN openSprints() AND statusCategory = Done`;
  const cpParams = new URLSearchParams({
    jql: cpJql,
    fields: fields.join(','),
    expand: 'changelog',
    maxResults: '200',
  });
  const cpEndpoint = `${JIRA_ENDPOINTS.search}?${cpParams.toString()}`;
  const cpData = await jiraFetch<{ issues: JiraIssueRaw[]; total: number }>(cpEndpoint);

  // Fetch IT tickets (completed, not carried over, excluding canceled)
  const itJql = `project = IT AND sprint = ${sprintId} AND sprint NOT IN openSprints() AND statusCategory = Done AND status != "IT - Canceled"`;
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
  const tickets = allIssues.map(transformIssue);

  // TEMPORARY: Collect all unique labels for analysis
  const allLabels = new Set<string>();
  allIssues.forEach(issue => {
    const labels = issue.fields.labels || [];
    labels.forEach(label => allLabels.add(label));
  });
  if (allLabels.size > 0) {
    console.log(`\n=== LABELS IN SPRINT ${sprintId} ===`);
    console.log(Array.from(allLabels).sort().join(', '));
    console.log('================\n');
  }

  // Debug logging
  const cpTickets = tickets.filter(t => t.project === 'CP');
  const itTickets = tickets.filter(t => t.project === 'IT');
  const cpPoints = cpTickets.reduce((sum, t) => sum + t.points, 0);
  const itPoints = itTickets.reduce((sum, t) => sum + t.points, 0);

  console.log(`[JIRA] Sprint ${sprintId} Summary:`);
  console.log(`  CP: ${cpData.total} issues, ${cpPoints} points`);
  console.log(`  IT: ${itData.total} issues, ${itPoints} points`);
  console.log(`  Total: ${cpData.total + itData.total} issues, ${cpPoints + itPoints} points`);
  console.log(`\nCP JQL: ${cpJql}`);
  console.log(`IT JQL: ${itJql}`);

  // Check what we'd get WITHOUT the openSprints filter
  const cpAllJql = `project = CP AND sprint = ${sprintId} AND statusCategory = Done`;
  const cpAllParams = new URLSearchParams({
    jql: cpAllJql,
    fields: 'key,summary,customfield_10031',
    maxResults: '200',
  });
  const cpAllEndpoint = `${JIRA_ENDPOINTS.search}?${cpAllParams.toString()}`;
  const cpAllData = await jiraFetch<{ issues: JiraIssueRaw[]; total: number }>(cpAllEndpoint);
  const cpAllPoints = cpAllData.issues.reduce((sum, issue) => sum + (issue.fields.customfield_10031 ?? 0), 0);

  if (cpAllData.total > cpData.total) {
    console.log(`\n⚠️  DIFFERENCE DETECTED:`);
    console.log(`  WITHOUT openSprints filter: ${cpAllData.total} CP issues, ${cpAllPoints} points`);
    console.log(`  WITH openSprints filter: ${cpData.total} CP issues, ${cpPoints} points`);
    console.log(`  EXCLUDED: ${cpAllData.total - cpData.total} issues, ${cpAllPoints - cpPoints} points`);

    // Find which tickets were excluded
    const includedKeys = new Set(cpData.issues.map(i => i.key));
    const excluded = cpAllData.issues.filter(i => !includedKeys.has(i.key));
    console.log(`\nExcluded tickets (carried over):`);
    excluded.forEach(issue => {
      console.log(`  - ${issue.key}: ${issue.fields.summary} (${issue.fields.customfield_10031 ?? 0} pts)`);
    });
  }

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
    const [sprint, tickets] = await Promise.all([
      fetchSprintById(sprintId),
      fetchSprintIssues(sprintId),
    ]);

    if (!sprint) {
      throw new Error(`Sprint ${sprintId} not found`);
    }

    return { sprint, tickets };
  } catch (error) {
    console.error('Failed to fetch sprint data:', error);
    throw error;
  }
}
