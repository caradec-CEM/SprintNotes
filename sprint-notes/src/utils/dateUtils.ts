import type { JiraChangelog, StatusDuration, StatusSpan, PointChange } from '../types';

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
  const rounded = Math.round(days);

  if (rounded === 1) {
    return `${prefix}1d`;
  }

  return `${prefix}${rounded}d`;
}

/**
 * Calculate expected days based on story points
 * Point scale:
 * - 1 pt = 0.5-1 day
 * - 2 pts = 1 day
 * - 3 pts = 1.5 days
 * - 5 pts = 2.5 days
 * - 8 pts = 4 days
 * - 13 pts = 6.5 days
 */
export function getExpectedDays(points: number): number {
  if (points <= 1) return 1;
  if (points === 2) return 1;
  if (points === 3) return 1.5;
  if (points === 5) return 2.5;
  if (points === 8) return 4;
  if (points >= 13) return 6.5;
  // Linear interpolation for other values
  return points * 0.5;
}

/**
 * Get CSS class for duration color coding based on story points
 * Compares actual duration vs expected duration for the ticket size
 */
export function getDurationClass(days: number | undefined, points: number, expectedDays?: number): string {
  if (!days) return 'duration--none';

  const expected = expectedDays ?? getExpectedDays(points);

  // Green: On track or reasonably close (expected + 1 day buffer for estimates)
  if (days <= expected + 1) return 'duration--fast';

  // Yellow: Behind but not critical (expected + 2 days)
  if (days <= expected + 2) return 'duration--medium';

  // Red: Significantly behind (more than 2 days over expected)
  return 'duration--slow';
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
  const spans: StatusSpan[] = [];

  // Sort histories chronologically
  const sortedHistories = [...changelog.histories].sort(
    (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime()
  );

  // Debug: Collect all unique status names for this issue
  const statusNames = new Set<string>();

  const enableDebug = false;

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
          spans.push({ entered: lastEntryTime, exited: history.created, days });
          lastEntryTime = null;
          currentlyInStatus = false;
        }
      }
    }
  }


  // Still in status - calculate to now
  if (currentlyInStatus && lastEntryTime) {
    if (enableDebug) {
      console.log(`[${issueKey}] Still in status, calculating to now`);
    }
    const days = calculateBusinessDays(lastEntryTime, new Date().toISOString(), enableDebug);
    totalDays += days;
    spans.push({ entered: lastEntryTime, exited: null, days });
  }

  return totalDays > 0 ? { days: totalDays, isActive: currentlyInStatus, spans } : undefined;
}

/**
 * Extract the most recent story point change from changelog
 * Uses only the last change entry to avoid spanning across sprints
 */
export function extractPointChange(
  changelog: JiraChangelog | undefined,
  _issueKey?: string
): PointChange | undefined {
  if (!changelog?.histories) return undefined;

  // Sort histories chronologically
  const sortedHistories = [...changelog.histories].sort(
    (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime()
  );

  let lastFrom: number | null = null;
  let lastTo: number | null = null;

  for (const history of sortedHistories) {
    for (const item of history.items) {
      if (item.field === 'Story Points') {
        const from = item.fromString ? parseFloat(item.fromString) : null;
        const to = item.toString ? parseFloat(item.toString) : null;

        if (from !== null) {
          lastFrom = from;
        }
        if (to !== null) {
          lastTo = to;
        }
      }
    }
  }

  if (lastFrom !== null && lastTo !== null && lastFrom !== lastTo) {
    return { from: lastFrom, to: lastTo };
  }

  return undefined;
}

/** Format status spans into a hover tooltip string */
export function formatStatusTooltip(spans: StatusSpan[]): string {
  if (spans.length === 0) return '';
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };
  return spans.map((s) => {
    const entered = fmt(s.entered);
    const exited = s.exited ? fmt(s.exited) : 'now';
    return `${entered} \u2013 ${exited} (${s.days}d)`;
  }).join('\n');
}

/** Format a sprint date range compactly: "Jan 6 – Jan 17, 2025" */
export function formatSprintDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate);
  const end = new Date(endDate);

  const shortDate: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const sameYear = start.getFullYear() === end.getFullYear();

  const startStr = sameYear
    ? start.toLocaleDateString('en-US', shortDate)
    : start.toLocaleDateString('en-US', { ...shortDate, year: 'numeric' });

  const endStr = end.toLocaleDateString('en-US', { ...shortDate, year: 'numeric' });

  return `${startStr} \u2013 ${endStr}`;
}
