import { useState, useMemo } from 'react';
import type { Ticket } from '../../types';
import { TypeBadge, PriorityBadge, TicketLink } from '../common';
import { formatDuration, getDurationClass } from '../../utils/dateUtils';
import { getLabelDisplayName, getPrimaryPlatform } from '../../config/labels';
import './TicketTable.css';

type SortKey = 'key' | 'type' | 'priority' | 'points' | 'developer' | 'reviewer'
  | 'inProgressDuration' | 'inReviewDuration';
type SortDir = 'asc' | 'desc';

interface TicketTableProps {
  tickets: Ticket[];
  engineerId: string;
  showDevReviewer?: boolean;
}

// Sort order for priorities
const PRIORITY_ORDER: Record<string, number> = {
  Highest: 5,
  High: 4,
  Medium: 3,
  Low: 2,
  Lowest: 1,
};

// Get CSS class for points based on value
function getPointsClass(points: number): string {
  if (!points) return 'points--none';
  if (points >= 8) return 'points--xlarge';
  if (points >= 5) return 'points--large';
  if (points >= 3) return 'points--medium';
  if (points >= 2) return 'points--small';
  return 'points--xsmall';
}

export function TicketTable({ tickets, engineerId, showDevReviewer = true }: TicketTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('key');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // Group and sort tickets
  const groupedTickets = useMemo(() => {
    // First sort tickets within their groups
    const sorted = [...tickets].sort((a, b) => {
      let comparison = 0;

      switch (sortKey) {
        case 'key':
          comparison = a.key.localeCompare(b.key);
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
        case 'priority':
          comparison = (PRIORITY_ORDER[b.priority] || 0) - (PRIORITY_ORDER[a.priority] || 0);
          break;
        case 'points':
          comparison = b.points - a.points;
          break;
        case 'developer':
          comparison = (a.developerNames[0] || 'zzz').localeCompare(b.developerNames[0] || 'zzz');
          break;
        case 'reviewer':
          comparison = (a.reviewerNames[0] || 'zzz').localeCompare(b.reviewerNames[0] || 'zzz');
          break;
        case 'inProgressDuration':
          comparison = (b.inProgressDuration?.days ?? 0) - (a.inProgressDuration?.days ?? 0);
          break;
        case 'inReviewDuration':
          comparison = (b.inReviewDuration?.days ?? 0) - (a.inReviewDuration?.days ?? 0);
          break;
      }

      return sortDir === 'asc' ? comparison : -comparison;
    });

    // Group by platform
    const groups = new Map<string, Ticket[]>();
    sorted.forEach(ticket => {
      const platform = getPrimaryPlatform(ticket.labels);
      if (!groups.has(platform)) {
        groups.set(platform, []);
      }
      groups.get(platform)!.push(ticket);
    });

    // Convert to array and sort platforms alphabetically (Other last)
    return Array.from(groups.entries())
      .sort(([a], [b]) => {
        if (a === 'Other') return 1;
        if (b === 'Other') return -1;
        return a.localeCompare(b);
      });
  }, [tickets, sortKey, sortDir]);

  if (tickets.length === 0) {
    return (
      <div className="ticket-table__empty">
        No tickets this sprint
      </div>
    );
  }

  // Check if the current engineer is a developer/reviewer for highlighting
  const isCurrentEngineer = (memberId: string | null) => memberId === engineerId;
  const isCurrentDeveloper = (developers: string[]) => developers.includes(engineerId);
  const isCurrentReviewer = (reviewers: string[]) => reviewers.includes(engineerId);

  return (
    <div className="ticket-table-wrapper">
      <table className="ticket-table">
        <thead>
          <tr>
            <th onClick={() => handleSort('key')} className="sortable">
              Key {sortKey === 'key' && (sortDir === 'asc' ? '↑' : '↓')}
            </th>
            <th onClick={() => handleSort('type')} className="sortable">
              Type {sortKey === 'type' && (sortDir === 'asc' ? '↑' : '↓')}
            </th>
            <th>Summary</th>
            <th onClick={() => handleSort('priority')} className="sortable">
              Priority {sortKey === 'priority' && (sortDir === 'asc' ? '↑' : '↓')}
            </th>
            <th onClick={() => handleSort('inProgressDuration')} className="sortable">
              In Progress {sortKey === 'inProgressDuration' && (sortDir === 'asc' ? '↑' : '↓')}
            </th>
            <th onClick={() => handleSort('inReviewDuration')} className="sortable">
              In Review {sortKey === 'inReviewDuration' && (sortDir === 'asc' ? '↑' : '↓')}
            </th>
            <th onClick={() => handleSort('points')} className="sortable">
              Pts {sortKey === 'points' && (sortDir === 'asc' ? '↑' : '↓')}
            </th>
            {showDevReviewer && (
              <>
                <th onClick={() => handleSort('developer')} className="sortable">
                  Developer {sortKey === 'developer' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('reviewer')} className="sortable">
                  Reviewer {sortKey === 'reviewer' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
              </>
            )}
            <th>Labels</th>
          </tr>
        </thead>
        <tbody>
          {groupedTickets.map(([platform, platformTickets]) => (
            <>
              <tr key={`platform-${platform}`} className="platform-group-header">
                <td colSpan={showDevReviewer ? 10 : 8}>
                  <strong>{platform}</strong> ({platformTickets.length} {platformTickets.length === 1 ? 'ticket' : 'tickets'})
                </td>
              </tr>
              {platformTickets.map((ticket) => (
            <tr key={ticket.key}>
              <td>
                <TicketLink ticketKey={ticket.key} summary={ticket.summary} />
                {ticket.isCarryOver && (
                  <span className="badge badge--carryover" title="Carried over from previous sprint">CO</span>
                )}
              </td>
              <td>
                <TypeBadge type={ticket.type} />
              </td>
              <td className="summary-cell" title={ticket.summary}>
                {ticket.summary}
              </td>
              <td>
                <PriorityBadge priority={ticket.priority} />
              </td>
              <td className="duration-cell">
                <span className={
                  isCurrentDeveloper(ticket.developers)
                    ? getDurationClass(ticket.inProgressDuration?.days, ticket.points)
                    : 'duration--muted'
                }>
                  {formatDuration(ticket.inProgressDuration?.days, ticket.inProgressDuration?.isActive)}
                </span>
              </td>
              <td className="duration-cell">
                <span className={
                  isCurrentReviewer(ticket.reviewers)
                    ? getDurationClass(ticket.inReviewDuration?.days, ticket.points)
                    : 'duration--muted'
                }>
                  {formatDuration(ticket.inReviewDuration?.days, ticket.inReviewDuration?.isActive)}
                </span>
              </td>
              <td className={`points-cell ${getPointsClass(ticket.points)}`}>
                {ticket.points || '-'}
                {ticket.pointChange && (
                  <span
                    className={ticket.pointChange.to > ticket.pointChange.from ? 'points-change--up' : 'points-change--down'}
                    title={`Changed from ${ticket.pointChange.from}`}
                  >
                    {ticket.pointChange.to > ticket.pointChange.from ? '▲' : '▼'}
                  </span>
                )}
              </td>
              {showDevReviewer && (
                <>
                  <td>
                    {ticket.developerNames.length > 0 ? (
                      ticket.developerNames.map((name, idx) => (
                        <span
                          key={idx}
                          className={`person ${isCurrentEngineer(ticket.developers[idx]) ? 'person--highlight' : ''}`}
                          style={{ marginRight: '4px' }}
                        >
                          {name}
                        </span>
                      ))
                    ) : (
                      <span>-</span>
                    )}
                  </td>
                  <td>
                    {ticket.reviewerNames.length > 0 ? (
                      ticket.reviewerNames.map((name, idx) => (
                        <span
                          key={idx}
                          className={`person ${isCurrentEngineer(ticket.reviewers[idx]) ? 'person--highlight' : ''}`}
                          style={{ marginRight: '4px' }}
                        >
                          {name}
                        </span>
                      ))
                    ) : (
                      <span>-</span>
                    )}
                  </td>
                </>
              )}
              <td className="labels-cell">
                {ticket.categorizedLabels.product.map((label) => (
                  <span key={label} className="label-tag label-tag--product" title="Product">
                    {getLabelDisplayName(label)}
                  </span>
                ))}
                {ticket.categorizedLabels.platform.map((label) => (
                  <span key={label} className="label-tag label-tag--platform" title="Platform">
                    {getLabelDisplayName(label)}
                  </span>
                ))}
                {ticket.categorizedLabels.misc.map((label) => (
                  <span key={label} className="label-tag label-tag--misc" title="Misc">
                    {getLabelDisplayName(label)}
                  </span>
                ))}
              </td>
            </tr>
              ))}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
