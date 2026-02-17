import type { JiraChangelog, StatusDuration } from '../types';

/**
 * Calculate business days (weekdays only) between two timestamps
 * Uses local timezone and excludes partial days outside business hours
 *
 * Rules:
 * - If start time is after 5 PM, don't count that day (after business hours)
 * - If end time is before 9 AM, don't count that day (before business hours)
 * - Weekends are always excluded
 */
export function calculateBusinessDays(start: string, end: string, debug = false): number {
  const startDate = new Date(start);
  const endDate = new Date(end);

  if (debug) {
    console.log('calculateBusinessDays:', {
      start: startDate.toLocaleString('en-US'),
      end: endDate.toLocaleString('en-US'),
      startHour: startDate.getHours(),
      endHour: endDate.getHours(),
    });
  }

  // Get day boundaries in local timezone
  const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

  // Adjust start day if after business hours (5 PM = 17:00)
  const effectiveStartDay = new Date(startDay);
  if (startDate.getHours() >= 17) {
    effectiveStartDay.setDate(effectiveStartDay.getDate() + 1);
    if (debug) {
      console.log(`  Start after 5 PM, moving to next day: ${effectiveStartDay.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`);
    }
  }

  // Adjust end day if before business hours (9 AM = 09:00)
  const effectiveEndDay = new Date(endDay);
  if (endDate.getHours() < 9) {
    effectiveEndDay.setDate(effectiveEndDay.getDate() - 1);
    if (debug) {
      console.log(`  End before 9 AM, moving to previous day: ${effectiveEndDay.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`);
    }
  }

  let businessDays = 0;
  const current = new Date(effectiveStartDay);

  while (current <= effectiveEndDay) {
    const dayOfWeek = current.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (!isWeekend) {
      businessDays++;
      if (debug) {
        console.log(`  ${current.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} - business day (total: ${businessDays})`);
      }
    } else if (debug) {
      console.log(`  ${current.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} - WEEKEND (skipped)`);
    }

    // Move to next day
    current.setDate(current.getDate() + 1);
  }

  if (debug) {
    console.log('Total business days:', businessDays);
  }

  return businessDays;
}

/**
 * Format business days as human-readable duration
 */
export function formatDuration(days: number | undefined, isActive: boolean = false): string {
  if (days === undefined || days === 0) return '-';

  const prefix = isActive ? '~' : '';

  if (days === 1) {
    return `${prefix}1d`;
  }

  return `${prefix}${days}d`;
}

/**
 * Get CSS class for duration color coding
 */
export function getDurationClass(days: number | undefined): string {
  if (!days) return 'duration--none';
  if (days === 1) return 'duration--fast';    // Green: 1 day
  if (days <= 3) return 'duration--medium';   // Yellow: 2-3 days
  return 'duration--slow';                    // Red: >3 days
}

/**
 * Calculate total business days in a specific status from changelog
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

  let totalDays = 0;
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
        // Exited target status - calculate business days
        else if (item.fromString && statusSet.has(item.fromString) && lastEntryTime) {
          if (enableDebug) {
            console.log(`[${issueKey}] Exited "${item.fromString}" at ${history.created}`);
          }
          const days = calculateBusinessDays(lastEntryTime, history.created, enableDebug);
          totalDays += days;
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
    totalDays += calculateBusinessDays(lastEntryTime, new Date().toISOString(), enableDebug);
  }

  return totalDays > 0 ? { days: totalDays, isActive: currentlyInStatus } : undefined;
}
