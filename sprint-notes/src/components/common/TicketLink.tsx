import { JIRA_CONFIG } from '../../config/jira';
import './TicketLink.css';

interface TicketLinkProps {
  ticketKey: string;
  summary?: string;
  showSummary?: boolean;
}

export function TicketLink({ ticketKey, summary, showSummary = false }: TicketLinkProps) {
  const url = `${JIRA_CONFIG.baseUrl}/browse/${ticketKey}`;

  return (
    <span className="ticket-link">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="ticket-link__key"
        title={summary}
      >
        {ticketKey}
      </a>
      {showSummary && summary && (
        <span className="ticket-link__summary">{summary}</span>
      )}
    </span>
  );
}
