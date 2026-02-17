import type { JiraChangelog, StatusDuration } from '../types';

/**
 * Calculate business hours (excluding weekends) between two ISO timestamps
 */
export function calculateBusinessHours(start: string, end: string, debug = false): number {
  const startDate = new Date(start);
  const endDate = new Date(end);

  if (debug) {
    console.log('calculateBusinessHours:', {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      startDay: startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      endDay: endDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    });
  }

  let totalHours = 0;
  const current = new Date(startDate);
  let iteration = 0;

  while (current < endDate) {
    const dayOfWeek = current.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (!isWeekend) {
      const nextDay = new Date(current);
      nextDay.setDate(nextDay.getDate() + 1);
      nextDay.setHours(0, 0, 0, 0);

      const endOfPeriod = nextDay < endDate ? nextDay : endDate;
      const periodHours = (endOfPeriod.getTime() - current.getTime()) / (1000 * 60 * 60);
      totalHours += periodHours;

      if (debug) {
        console.log(`  Day ${iteration + 1}:`, {
          date: current.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
          from: current.toISOString(),
          to: endOfPeriod.toISOString(),
          hours: periodHours.toFixed(2),
          total: totalHours.toFixed(2),
        });
      }
    } else if (debug) {
      console.log(`  Day ${iteration + 1}: ${current.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} - WEEKEND (skipped)`);
    }

    // Move to next day
    current.setDate(current.getDate() + 1);
    current.setHours(0, 0, 0, 0);
    iteration++;
  }

  if (debug) {
    console.log('Total hours:', totalHours.toFixed(2), '=', (totalHours / 8).toFixed(2), 'business days');
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

  // Enable detailed debug logging for specific ticket
  const enableDebug = issueKey === 'CP-3189';

  // Track all status transitions
  for (const history of sortedHistories) {
    for (const item of history.items) {
      if (item.field === 'status') {
        if (item.toString) statusNames.add(item.toString);
        if (item.fromString) statusNames.add(item.fromString);

        // Entered target status (match any in the set)
        if (item.toString && statusSet.has(item.toString)) {
          if (enableDebug) {
            console.log(`[${issueKey}] Entered "${item.toString}" at ${history.created}`);
          }
          lastEntryTime = history.created;
          currentlyInStatus = true;
        }
        // Exited target status - calculate business hours
        else if (item.fromString && statusSet.has(item.fromString) && lastEntryTime) {
          if (enableDebug) {
            console.log(`[${issueKey}] Exited "${item.fromString}" at ${history.created}`);
          }
          const hours = calculateBusinessHours(lastEntryTime, history.created, enableDebug);
          totalHours += hours;
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
    if (enableDebug) {
      console.log(`[${issueKey}] Still in status, calculating to now`);
    }
    totalHours += calculateBusinessHours(lastEntryTime, new Date().toISOString(), enableDebug);
  }

  return totalHours > 0 ? { hours: totalHours, isActive: currentlyInStatus } : undefined;
}
