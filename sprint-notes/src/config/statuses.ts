/**
 * JIRA status name configuration for duration tracking
 *
 * Update these based on your actual JIRA workflow status names.
 * Check browser console logs to see what status names appear in your tickets.
 */

export interface StatusConfig {
  inProgress: string[];  // Status names that count as "In Progress"
  inReview: string[];    // Status names that count as "In Review"
}

export const CP_STATUS_CONFIG: StatusConfig = {
  inProgress: ['In Progress'],
  inReview: [
    'In Review',
    'Code Review',
    'Review',
    'In Review (CP)',
    'Peer Review',
  ],
};

export const IT_STATUS_CONFIG: StatusConfig = {
  inProgress: [
    'In Progress',
    'In Progress (IT)',
    'Working',
  ],
  inReview: [
    'In Review',
    'In Review (IT)',
    'Review',
    'Waiting for Approval',
  ],
};

export function getStatusConfig(project: 'CP' | 'IT'): StatusConfig {
  return project === 'IT' ? IT_STATUS_CONFIG : CP_STATUS_CONFIG;
}
