export const JIRA_CONFIG = {
  cloudId: import.meta.env.VITE_JIRA_CLOUD_ID || '0d22a5f5-682a-42f5-890e-ab43691f0307',
  baseUrl: 'https://cembenchmarking.atlassian.net',
  boardId: 9,  // Engineering board

  customFields: {
    storyPoints: 'customfield_10031',
    developer: 'customfield_10124',    // User picker (multiple)
    reviewer: 'customfield_10058',      // User picker (single)
    sprint: 'customfield_10020',
  },

  // Fields to request from JIRA API
  issueFields: [
    'summary',
    'issuetype',
    'priority',
    'assignee',
    'labels',
    'resolutiondate',
    'customfield_10031',  // Story Points
    'customfield_10124',  // Developer
    'customfield_10058',  // Reviewer
    'customfield_10020',  // Sprint
  ],

  // JQL query templates
  queries: {
    sprintIssues: (sprintId: string) =>
      `sprint = ${sprintId} AND statusCategory = Done ORDER BY key ASC`,
    itIssues: (sprintId: string) =>
      `project = IT AND sprint = ${sprintId} AND statusCategory = Done ORDER BY key ASC`,
    // Combined query for both CP and IT
    allSprintIssues: (sprintId: string) =>
      `sprint = ${sprintId} AND statusCategory = Done ORDER BY key ASC`,
  },
} as const;

// API endpoints
export const JIRA_ENDPOINTS = {
  search: '/rest/api/3/search/jql',  // New endpoint (old /search is deprecated)
  sprints: (boardId: number) => `/rest/agile/1.0/board/${boardId}/sprint`,
} as const;
