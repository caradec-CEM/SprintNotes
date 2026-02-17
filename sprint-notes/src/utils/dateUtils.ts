import type { JiraChangelog, StatusDuration } from '../types';

/**
 * Calculate business hours (excluding weekends) between two ISO timestamps
 */
export function calculateBusinessHours(start: string, end: string): number {
  const startDate = new Date(start);
  const endDate = new Date(end);

  let totalHours = 0;
  const current = new Date(startDate);

  while (current < endDate) {
    const dayOfWeek = current.getDay();

    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const nextDay = new Date(current);
      nextDay.setDate(nextDay.getDate() + 1);
      nextDay.setHours(0, 0, 0, 0);

      const endOfPeriod = nextDay < endDate ? nextDay : endDate;
      const periodHours = (endOfPeriod.getTime() - current.getTime()) / (1000 * 60 * 60);
      totalHours += periodHours;
    }

    // Move to next day
    current.setDate(current.getDate() + 1);
    current.setHours(0, 0, 0, 0);
  }

  return totalHours;
}

/**
 * Format business hours as human-readable duration
 */
export function formatDuration(hours: number | undefined, isActive: boolean = false): string {
  if (hours === undefined || hours === 0) return '-';

  const prefix = isActive ? '~' : '';
  const businessDays = hours / 8; // 8 hour work days

  if (businessDays < 1) {
    return `${prefix}${hours.toFixed(1)}h`;
  }

  return `${prefix}${businessDays.toFixed(1)}d`;
}

/**
 * Get CSS class for duration color coding
 */
export function getDurationClass(hours: number | undefined): string {
  if (!hours) return 'duration--none';
  const days = hours / 8;
  if (days < 1) return 'duration--fast';      // Green: <1 day
  if (days < 3) return 'duration--medium';    // Yellow: 1-3 days
  return 'duration--slow';                    // Red: >3 days
}

/**
 * Calculate total business time in a specific status from changelog
 * Supports matching multiple status names (e.g., ["In Review", "Code Review"])
 */
export function calculateStatusDuration(
  changelog: JiraChangelog | undefined,
  targetStatuses: string | string[],
  issueKey?: string
): StatusDuration | undefined {
  if (!changelog?.histories) return undefined;

  // Normalize to array for easier matching
  const statusArray = Array.isArray(targetStatuses) ? targetStatuses : [targetStatuses];
  const statusSet = new Set(statusArray);

  let totalHours = 0;
  let currentlyInStatus = false;
  let lastEntryTime: string | null = null;

  // Sort histories chronologically
  const sortedHistories = [...changelog.histories].sort(
    (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime()
  );

  // Debug: Collect all unique status names for this issue
  const statusNames = new Set<string>();

  // Track all status transitions
  for (const history of sortedHistories) {
    for (const item of history.items) {
      if (item.field === 'status') {
        if (item.toString) statusNames.add(item.toString);
        if (item.fromString) statusNames.add(item.fromString);

        // Entered target status (match any in the set)
        if (item.toString && statusSet.has(item.toString)) {
          lastEntryTime = history.created;
          currentlyInStatus = true;
        }
        // Exited target status - calculate business hours
        else if (item.fromString && statusSet.has(item.fromString) && lastEntryTime) {
          totalHours += calculateBusinessHours(lastEntryTime, history.created);
          lastEntryTime = null;
          currentlyInStatus = false;
        }
      }
    }
  }

  // Debug logging for first few tickets to see what statuses exist
  if (issueKey && Math.random() < 0.1) { // Log ~10% of tickets to avoid spam
    console.log(`[${issueKey}] Status names found:`, Array.from(statusNames).sort());
    console.log(`[${issueKey}] Looking for:`, statusArray);
  }

  // Still in status - calculate to now
  if (currentlyInStatus && lastEntryTime) {
    totalHours += calculateBusinessHours(lastEntryTime, new Date().toISOString());
  }

  return totalHours > 0 ? { hours: totalHours, isActive: currentlyInStatus } : undefined;
}
