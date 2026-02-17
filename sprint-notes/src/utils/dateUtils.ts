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
 */
export function calculateStatusDuration(
  changelog: JiraChangelog | undefined,
  targetStatus: string
): StatusDuration | undefined {
  if (!changelog?.histories) return undefined;

  let totalHours = 0;
  let currentlyInStatus = false;
  let lastEntryTime: string | null = null;

  // Sort histories chronologically
  const sortedHistories = [...changelog.histories].sort(
    (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime()
  );

  // Track all status transitions
  for (const history of sortedHistories) {
    for (const item of history.items) {
      if (item.field === 'status') {
        // Entered target status
        if (item.toString === targetStatus) {
          lastEntryTime = history.created;
          currentlyInStatus = true;
        }
        // Exited target status - calculate business hours
        else if (item.fromString === targetStatus && lastEntryTime) {
          totalHours += calculateBusinessHours(lastEntryTime, history.created);
          lastEntryTime = null;
          currentlyInStatus = false;
        }
      }
    }
  }

  // Still in status - calculate to now
  if (currentlyInStatus && lastEntryTime) {
    totalHours += calculateBusinessHours(lastEntryTime, new Date().toISOString());
  }

  return totalHours > 0 ? { hours: totalHours, isActive: currentlyInStatus } : undefined;
}
