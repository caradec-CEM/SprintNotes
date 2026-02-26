import { useMemo } from 'react';
import { useSprintStore } from '../../stores/sprintStore';
import {
  detectBottlenecks,
  formatSpanRange,
  type BottleneckEntry,
  type BlockedReview,
} from '../../utils/bottleneckUtils';
import { TicketLink } from '../common';
import './ReviewBottlenecks.css';

function BlockedReviewRow({ review }: { review: BlockedReview }) {
  return (
    <div className="blocked-review">
      <div className="blocked-review__header">
        <TicketLink ticketKey={review.ticket.key} summary={review.ticket.summary} />
        <span className="blocked-review__span">
          in review {formatSpanRange(review.reviewSpan)}
        </span>
        <span className="blocked-review__days">{review.reviewSpan.days}d</span>
      </div>
      <div className="blocked-review__reason">
        {review.concurrentDevWork.map(dw => (
          <div key={dw.ticket.key} className="blocked-review__dev-line">
            <span className="blocked-review__dev-arrow">&larr;</span>
            was developing{' '}
            <TicketLink ticketKey={dw.ticket.key} summary={dw.ticket.summary} />
            <span className="blocked-review__dev-span">
              {formatSpanRange(dw.devSpan)}
            </span>
            <span className="blocked-review__overlap">{dw.overlapDays}d overlap</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BottleneckCard({ entry }: { entry: BottleneckEntry }) {
  return (
    <div className="bottleneck-card">
      <div className="bottleneck-card__header">
        <span className="bottleneck-card__name">{entry.engineerName}</span>
        <span className="bottleneck-card__count">
          {entry.blockedReviews.length} blocked review{entry.blockedReviews.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="bottleneck-card__reviews">
        {entry.blockedReviews.map((br, i) => (
          <BlockedReviewRow key={`${br.ticket.key}-${i}`} review={br} />
        ))}
      </div>
    </div>
  );
}

export function ReviewBottlenecks() {
  const currentSprint = useSprintStore((state) => state.currentSprint);
  const inFlightTickets = useSprintStore((state) => state.inFlightTickets);

  const bottlenecks = useMemo(() => {
    if (!currentSprint) return [];
    return detectBottlenecks(currentSprint.tickets, inFlightTickets);
  }, [currentSprint, inFlightTickets]);

  if (!currentSprint) return null;

  if (bottlenecks.length === 0) {
    return (
      <div className="review-bottlenecks__empty">
        No review bottlenecks detected
      </div>
    );
  }

  return (
    <div className="review-bottlenecks__list">
      {bottlenecks.map(entry => (
        <BottleneckCard key={entry.engineerId} entry={entry} />
      ))}
    </div>
  );
}
