import React, { useState, useMemo, useCallback } from 'react';
import type { Ticket, StatusSpan, PointChange, ChangelogEntry } from '../../types';
import { TypeBadge, PriorityBadge, TicketLink, Tooltip } from '../common';
import { formatDuration, getDurationClass } from '../../utils/dateUtils';
import { useDurationBaselines } from '../../hooks/useDurationBaselines';
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

function formatSpanDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function renderDurationTooltip(label: string, totalDays: number, spans: StatusSpan[]) {
  return (
    <div>
      <span className="tooltip-label">{label}</span>{' \u00b7 '}
      {totalDays} business day{totalDays !== 1 ? 's' : ''}
      <hr className="tooltip-divider" />
      {spans.map((s, i) => (
        <div key={i}>
          {formatSpanDate(s.entered)} {'\u2192'} {s.exited ? formatSpanDate(s.exited) : 'now'}
          {' '}({s.days}d)
        </div>
      ))}
    </div>
  );
}

function formatChangelogDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatFieldName(field: string): string {
  switch (field) {
    case 'status': return 'Status';
    case 'Story Points': return 'Points';
    case 'priority': return 'Priority';
    case 'assignee': return 'Assignee';
    case 'Developer': return 'Developer';
    case 'Reviewer': return 'Reviewer';
    case 'labels': return 'Labels';
    default: return field;
  }
}

function renderChangelog(entries: ChangelogEntry[], colCount: number) {
  // Group by field category
  const statusEntries = entries.filter(e => e.field === 'status');
  const fieldEntries = entries.filter(e => e.field !== 'status');

  return (
    <tr className="changelog-row">
      <td colSpan={colCount}>
        <div className="changelog-panel">
          {statusEntries.length > 0 && (
            <div className="changelog-group">
              <div className="changelog-group__label">Status Changes</div>
              <div className="changelog-timeline">
                {statusEntries.map((entry, i) => (
                  <div key={i} className="changelog-entry">
                    <span className="changelog-entry__dot" />
                    <span className="changelog-entry__date">{formatChangelogDate(entry.timestamp)}</span>
                    <span className="changelog-entry__value">
                      {entry.from ?? '—'} <span className="changelog-entry__arrow">{'\u2192'}</span> {entry.to ?? '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {fieldEntries.length > 0 && (
            <div className="changelog-group">
              <div className="changelog-group__label">Field Changes</div>
              <div className="changelog-timeline">
                {fieldEntries.map((entry, i) => (
                  <div key={i} className="changelog-entry">
                    <span className="changelog-entry__dot" />
                    <span className="changelog-entry__date">{formatChangelogDate(entry.timestamp)}</span>
                    <span className="changelog-entry__field">{formatFieldName(entry.field)}</span>
                    <span className="changelog-entry__value">
                      {entry.from ?? '—'} <span className="changelog-entry__arrow">{'\u2192'}</span> {entry.to ?? '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {statusEntries.length === 0 && fieldEntries.length === 0 && (
            <div className="changelog-empty">No changelog entries</div>
          )}
        </div>
      </td>
    </tr>
  );
}

function renderPointChangeTooltip(change: PointChange) {
  const diff = change.to - change.from;
  const sign = diff > 0 ? '+' : '';
  return (
    <div>
      <span className="tooltip-label">Points changed</span>
      <br />
      <span className="tooltip-change">
        {change.from} {'\u2192'} {change.to}{'  '}({sign}{diff})
      </span>
    </div>
  );
}

export function TicketTable({ tickets, engineerId, showDevReviewer = true }: TicketTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('key');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
  const { getExpectedDays } = useDurationBaselines();

  const colCount = showDevReviewer ? 10 : 8;

  const toggleExpand = useCallback((ticketKey: string) => {
    setExpandedTicket(prev => prev === ticketKey ? null : ticketKey);
  }, []);

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
            <React.Fragment key={ticket.key}>
            <tr
              className={`${ticket.changelog?.length ? 'ticket-row--expandable' : ''}${expandedTicket === ticket.key ? ' ticket-row--expanded' : ''}`}
              onClick={ticket.changelog?.length ? () => toggleExpand(ticket.key) : undefined}
            >
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
                <Tooltip content={
                  ticket.inProgressDuration?.spans
                    ? renderDurationTooltip('In Progress', ticket.inProgressDuration.days, ticket.inProgressDuration.spans)
                    : null
                }>
                  <span className={
                    isCurrentDeveloper(ticket.developers)
                      ? getDurationClass(ticket.inProgressDuration?.days, ticket.points, getExpectedDays(ticket.points))
                      : 'duration--muted'
                  }>
                    {formatDuration(ticket.inProgressDuration?.days, ticket.inProgressDuration?.isActive)}
                  </span>
                </Tooltip>
              </td>
              <td className="duration-cell">
                <Tooltip content={
                  ticket.inReviewDuration?.spans
                    ? renderDurationTooltip('In Review', ticket.inReviewDuration.days, ticket.inReviewDuration.spans)
                    : null
                }>
                  <span className={
                    isCurrentReviewer(ticket.reviewers)
                      ? getDurationClass(ticket.inReviewDuration?.days, ticket.points, getExpectedDays(ticket.points))
                      : 'duration--muted'
                  }>
                    {formatDuration(ticket.inReviewDuration?.days, ticket.inReviewDuration?.isActive)}
                  </span>
                </Tooltip>
              </td>
              <td className={`points-cell ${getPointsClass(ticket.points)}${ticket.pointChange ? ' points-cell--changed' : ''}`}>
                <Tooltip content={ticket.pointChange ? renderPointChangeTooltip(ticket.pointChange) : null}>
                  <span>
                    {ticket.points || '-'}
                    {ticket.pointChange && (
                      <span
                        className={ticket.pointChange.to > ticket.pointChange.from ? 'points-change--up' : 'points-change--down'}
                      >
                        {ticket.pointChange.to > ticket.pointChange.from ? '▲' : '▼'}
                      </span>
                    )}
                  </span>
                </Tooltip>
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
            {expandedTicket === ticket.key && ticket.changelog && renderChangelog(ticket.changelog, colCount)}
            </React.Fragment>
              ))}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
