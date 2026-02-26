import { useSprintStore } from '../../stores/sprintStore';
import { Section } from '../layout';
import { LoadBalanceChart } from './LoadBalanceChart';
import { SummaryTable } from './SummaryTable';
import { ReviewBottlenecks } from './ReviewBottlenecks';
import { TeamTrends } from './TeamTrends';
import { SprintCapacityEditor } from './SprintCapacityEditor';
import { LoadingSpinner } from '../common';
import { formatSprintDateRange } from '../../utils/dateUtils';
import './TeamOverview.css';

export function TeamOverview() {
  const currentSprint = useSprintStore((state) => state.currentSprint);
  const ticketsLoading = useSprintStore((state) => state.ticketsLoading);
  const ticketsError = useSprintStore((state) => state.ticketsError);

  if (ticketsLoading) {
    return (
      <div className="team-overview team-overview--loading">
        <LoadingSpinner message="Loading sprint data..." />
      </div>
    );
  }

  if (ticketsError) {
    return (
      <div className="team-overview team-overview--error">
        <div className="error-message">
          <h3>Failed to load sprint data</h3>
          <p>{ticketsError}</p>
        </div>
      </div>
    );
  }

  if (!currentSprint) {
    return (
      <div className="team-overview team-overview--empty">
        <p>Select a sprint to view team overview</p>
      </div>
    );
  }

  const cpTickets = currentSprint.tickets.filter(t => t.project === 'CP');
  const itTickets = currentSprint.tickets.filter(t => t.project === 'IT');
  const totalTickets = itTickets.length;
  const totalPoints = cpTickets.reduce((sum, t) => sum + t.points, 0);


  return (
    <div className="team-overview">
      {/* Sprint Header */}
      <div className="team-overview__header">
        <div className="team-overview__header-left">
          <h2 className="team-overview__title">{currentSprint.name}</h2>
          {currentSprint.startDate && currentSprint.date && (
            <span className="team-overview__dates">
              {formatSprintDateRange(currentSprint.startDate, currentSprint.date)}
            </span>
          )}
        </div>
        <div className="team-overview__stats">
          <span className="stat">
            <strong>{totalTickets}</strong> tickets
          </span>
          <span className="stat">
            <strong>{totalPoints}</strong> points
          </span>
          <SprintCapacityEditor />
        </div>
      </div>

      <div className="team-overview__content">
        {/* Summary Table */}
        <Section title="Team Summary" flush>
          <SummaryTable />
        </Section>

        {/* Load Balance Chart */}
        <Section title="Workload Distribution">
          <LoadBalanceChart />
        </Section>

        {/* Review Bottlenecks */}
        <Section title="Review Bottlenecks">
          <ReviewBottlenecks />
        </Section>

        {/* Team Trends */}
        <Section title="Team Trends">
          <TeamTrends />
        </Section>
      </div>
    </div>
  );
}
