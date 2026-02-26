import type { Ticket, StatusSpan } from '../types';
import { TEAM_MEMBERS } from '../config/team';
import { calculateBusinessDays } from './dateUtils';

/** Minimum review span duration (business days) to be worth flagging */
const MIN_REVIEW_DAYS = 2;

/** A dev ticket that overlapped with a blocked review, with date context */
export interface OverlappingDevWork {
  ticket: Ticket;
  /** The specific In Progress span that overlapped */
  devSpan: StatusSpan;
  overlapDays: number;
}

/** A review ticket that was blocked, grouped with the dev work that caused it */
export interface BlockedReview {
  ticket: Ticket;
  /** The specific In Review span that was blocked */
  reviewSpan: StatusSpan;
  /** Dev tickets this engineer was working on during the review span */
  concurrentDevWork: OverlappingDevWork[];
}

export interface BottleneckEntry {
  engineerId: string;
  engineerName: string;
  blockedReviews: BlockedReview[];
}

function spanDurationDays(span: StatusSpan): number {
  return span.days;
}

/**
 * Find the best (longest) overlapping dev span for a given review span.
 */
function findOverlappingDevSpans(
  reviewSpan: StatusSpan,
  devTickets: Ticket[],
): OverlappingDevWork[] {
  const results: OverlappingDevWork[] = [];

  const rStart = new Date(reviewSpan.entered).getTime();
  const rEnd = reviewSpan.exited ? new Date(reviewSpan.exited).getTime() : Date.now();

  for (const devTicket of devTickets) {
    if (!devTicket.inProgressDuration?.spans) continue;

    let bestOverlap = 0;
    let bestSpan: StatusSpan | null = null;

    for (const devSpan of devTicket.inProgressDuration.spans) {
      const dStart = new Date(devSpan.entered).getTime();
      const dEnd = devSpan.exited ? new Date(devSpan.exited).getTime() : Date.now();

      const overlapStart = Math.max(rStart, dStart);
      const overlapEnd = Math.min(rEnd, dEnd);

      if (overlapStart < overlapEnd) {
        const days = calculateBusinessDays(
          new Date(overlapStart).toISOString(),
          new Date(overlapEnd).toISOString(),
        );
        if (days > bestOverlap) {
          bestOverlap = days;
          bestSpan = devSpan;
        }
      }
    }

    if (bestOverlap >= MIN_REVIEW_DAYS && bestSpan) {
      results.push({
        ticket: devTicket,
        devSpan: bestSpan,
        overlapDays: bestOverlap,
      });
    }
  }

  // Sort by overlap descending
  results.sort((a, b) => b.overlapDays - a.overlapDays);
  return results;
}

/** Format a date as "Jan 15" */
export function formatShortDate(iso: string | null): string {
  if (!iso) return 'now';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Format a span as "Jan 15 – Jan 20" or "Jan 15 – now" */
export function formatSpanRange(span: StatusSpan): string {
  return `${formatShortDate(span.entered)}\u2009\u2013\u2009${formatShortDate(span.exited)}`;
}

/**
 * Detect review bottlenecks grouped by blocked review ticket.
 *
 * For each engineer, finds review tickets (where they're the reviewer) that
 * sat in "Reviewing" for 2+ days while they were simultaneously developing
 * another ticket. Groups results by the blocked review for readability.
 */
export function detectBottlenecks(
  doneTickets: Ticket[],
  inFlightTickets: Ticket[],
): BottleneckEntry[] {
  const allTickets = [...doneTickets, ...inFlightTickets];
  const entries: BottleneckEntry[] = [];

  for (const member of TEAM_MEMBERS) {
    const developingTickets: Ticket[] = [];
    const reviewingTickets: Ticket[] = [];

    for (const ticket of allTickets) {
      const isDev = ticket.developers.includes(member.id) || ticket.developer === member.id;
      // Use fieldReviewers (JIRA Reviewer field only) to avoid false positives
      // from developers who moved their own ticket to "Reviewing"
      const isRev = ticket.fieldReviewers.includes(member.id);

      if (isDev && ticket.inProgressDuration?.spans?.length) {
        developingTickets.push(ticket);
      }
      if (isRev && ticket.inReviewDuration?.spans?.length) {
        reviewingTickets.push(ticket);
      }
    }

    if (developingTickets.length === 0 || reviewingTickets.length === 0) continue;

    const blockedReviews: BlockedReview[] = [];

    for (const revTicket of reviewingTickets) {
      for (const reviewSpan of revTicket.inReviewDuration!.spans) {
        // Only consider review spans that lasted 2+ business days
        if (spanDurationDays(reviewSpan) < MIN_REVIEW_DAYS) continue;

        // Find dev tickets (excluding the review ticket itself) that overlapped
        const devWork = findOverlappingDevSpans(
          reviewSpan,
          developingTickets.filter(d => d.key !== revTicket.key),
        );

        if (devWork.length > 0) {
          blockedReviews.push({
            ticket: revTicket,
            reviewSpan,
            concurrentDevWork: devWork,
          });
        }
      }
    }

    if (blockedReviews.length > 0) {
      // Sort by review span duration descending
      blockedReviews.sort((a, b) => spanDurationDays(b.reviewSpan) - spanDurationDays(a.reviewSpan));

      entries.push({
        engineerId: member.id,
        engineerName: member.name,
        blockedReviews,
      });
    }
  }

  // Sort engineers by number of blocked reviews descending
  entries.sort((a, b) => b.blockedReviews.length - a.blockedReviews.length);
  return entries;
}
