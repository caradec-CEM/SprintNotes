import type { TicketType, Priority } from '../../types';
import './Badge.css';

interface TypeBadgeProps {
  type: TicketType;
}

export function TypeBadge({ type }: TypeBadgeProps) {
  return (
    <span className={`badge badge--type badge--${type.toLowerCase()}`}>
      {type}
    </span>
  );
}

interface PriorityBadgeProps {
  priority: Priority;
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  return (
    <span className={`badge badge--priority badge--${priority.toLowerCase()}`}>
      {priority}
    </span>
  );
}

interface RoleBadgeProps {
  role: 'dev' | 'review' | 'it';
}

export function RoleBadge({ role }: RoleBadgeProps) {
  const labels = {
    dev: 'Dev',
    review: 'Review',
    it: 'IT',
  };

  return (
    <span className={`badge badge--role badge--${role}`}>
      {labels[role]}
    </span>
  );
}
