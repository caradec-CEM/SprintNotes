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
    'Review',              // ← Actual status from your JIRA
    'Reviewing',           // ← Actual status from your JIRA
    'Deployed to Staging', // ← Also counts as review phase
  ],
};

export const IT_STATUS_CONFIG: StatusConfig = {
  inProgress: [
    'IT - In Progress',    // ← IT tickets use "IT -" prefix
  ],
  inReview: [
    'IT - Review',         // ← In case IT tickets have review status
    'IT - Reviewing',
  ],
};

export function getStatusConfig(project: 'CP' | 'IT'): StatusConfig {
  return project === 'IT' ? IT_STATUS_CONFIG : CP_STATUS_CONFIG;
}
