import { findMemberById } from '../../config/team';
import { useEngineerData } from '../../hooks/useEngineerData';
import { useSprintStore } from '../../stores/sprintStore';
import { useNotesStore } from '../../stores/notesStore';
import { DEFAULT_SPRINT_CAPACITY, DEFAULT_TIME_OFF } from '../../utils/capacityUtils';
import { Section } from '../layout';
import { MetricsGrid } from './MetricsGrid';
import { TicketTable } from './TicketTable';
import { DiscussionNotes } from './DiscussionNotes';
import { ActionItems } from './ActionItems';
import { IndividualTrends } from './IndividualTrends';
import { TimeOffEditor } from './TimeOffEditor';
import './EngineerPanel.css';

interface EngineerPanelProps {
  engineerId: string;
}

export function EngineerPanel({ engineerId }: EngineerPanelProps) {
  const member = findMemberById(engineerId);
  const { allTickets, metrics, notes } = useEngineerData(engineerId);
  const currentSprint = useSprintStore((state) => state.currentSprint);
  const sprintNotes = useNotesStore((state) => state.sprintNotes);

  if (!member) {
    return <div className="engineer-panel__error">Engineer not found</div>;
  }

  const sprintId = currentSprint?.id;
  const sNotes = sprintId ? sprintNotes[sprintId] : undefined;
  const capacity = sNotes?.capacity ?? DEFAULT_SPRINT_CAPACITY;
  const timeOff = sNotes?.timeOff?.[engineerId] ?? { ...DEFAULT_TIME_OFF, workingDays: capacity.effectiveSprintDays };

  return (
    <div className="engineer-panel">
      {/* Header with avatar and name */}
      <div className="engineer-panel__header">
        {member.avatarUrl && (
          <img
            src={member.avatarUrl}
            alt={member.name}
            className="engineer-panel__avatar"
          />
        )}
        <div className="engineer-panel__info">
          <h2 className="engineer-panel__name">
            {member.name}
            {timeOff.ptoDays > 0 && (
              <span className="engineer-panel__pto-badge">{timeOff.ptoDays}d PTO</span>
            )}
          </h2>
          <p className="engineer-panel__summary">
            {metrics.totalItems} items · <span className="engineer-panel__dev-pts">{metrics.devPts} dev</span> + <span className="engineer-panel__review-pts">{metrics.reviewPts} review</span>
          </p>
        </div>
      </div>

      <div className="engineer-panel__content">
        {/* Metrics */}
        <Section title="Sprint Metrics">
          <MetricsGrid metrics={metrics} workingDays={timeOff.workingDays} defaultWorkingDays={capacity.defaultWorkingDays} />
        </Section>

        {/* Tickets */}
        <Section
          title="Tickets"
          defaultCollapsed={false}
          flush
          actions={
            <span className="engineer-panel__ticket-count">
              {allTickets.length}
            </span>
          }
        >
          <TicketTable
            tickets={allTickets}
            engineerId={engineerId}
            showDevReviewer={true}
          />
        </Section>

        {/* Time Off */}
        <Section title="Time Off" defaultCollapsed={true}>
          <TimeOffEditor engineerId={engineerId} />
        </Section>

        {/* Discussion Notes */}
        <Section title="Discussion Notes" defaultCollapsed={false}>
          <DiscussionNotes
            engineerId={engineerId}
            notes={notes.discussion}
          />
        </Section>

        {/* Action Items */}
        <Section title="Action Items" defaultCollapsed={false}>
          <ActionItems
            engineerId={engineerId}
            items={notes.actionItems}
          />
        </Section>

        {/* Individual Trends */}
        <Section title="Trends" defaultCollapsed={false}>
          <IndividualTrends engineerId={engineerId} />
        </Section>
      </div>
    </div>
  );
}
