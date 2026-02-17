import { useSprintStore } from '../../stores/sprintStore';
import { Section } from '../layout';
import { LoadBalanceChart } from './LoadBalanceChart';
import { SummaryTable } from './SummaryTable';
import { TeamTrends } from './TeamTrends';
import { LoadingSpinner } from '../common';
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
  const totalTickets = cpTickets.length;
  const totalPoints = cpTickets.reduce((sum, t) => sum + t.points, 0);
  console.log(`[TeamOverview] Rendering: ${totalTickets} CP tickets, ${totalPoints} points`);

  return (
    <div className="team-overview">
      {/* Sprint Header */}
      <div className="team-overview__header">
        <h2 className="team-overview__title">{currentSprint.name}</h2>
        <div className="team-overview__stats">
          <span className="stat">
            <strong>{totalTickets}</strong> tickets
          </span>
          <span className="stat">
            <strong>{totalPoints}</strong> points
          </span>
        </div>
      </div>

      <div className="team-overview__content">
        {/* Summary Table */}
        <Section title="Team Summary">
          <SummaryTable />
        </Section>

        {/* Load Balance Chart */}
        <Section title="Workload Distribution">
          <LoadBalanceChart />
        </Section>

        {/* Team Trends */}
        <Section title="Team Trends">
          <TeamTrends />
        </Section>
      </div>
    </div>
  );
}
