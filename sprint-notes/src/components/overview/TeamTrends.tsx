import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  ReferenceLine,
} from 'recharts';
import { useTeamTrends, calculateTeamDelta } from '../../hooks/useTeamTrends';
import './TeamTrends.css';

export function TeamTrends() {
  const { velocityData, currentVsPrevious } = useTeamTrends(6);

  if (velocityData.length < 2) {
    return (
      <div className="team-trends__empty">
        Not enough sprint history for trends. Data will appear after 2+ sprints.
      </div>
    );
  }

  const { current, previous } = currentVsPrevious;

  // Calculate delta for total points
  const totalDelta = calculateTeamDelta(current, previous, 'total');
  const ticketsDelta = calculateTeamDelta(current, previous, 'devCount');  // devCount holds totalTickets

  // Calculate averages
  const avgVelocity = Math.round(
    velocityData.reduce((sum, d) => sum + d.total, 0) / velocityData.length
  );
  const avgTickets = Math.round(
    velocityData.reduce((sum, d) => sum + d.devCount, 0) / velocityData.length
  );

  return (
    <div className="team-trends">
      {/* Sprint Comparison */}
      <div className="team-trends__comparison">
        <h4 className="team-trends__subtitle">vs Previous Sprint</h4>
        <div className="team-trends__comparison-grid">
          <div className="team-trends__metric team-trends__metric--primary">
            <div className="team-trends__metric-value">{totalDelta.value}</div>
            <div className="team-trends__metric-label">Points</div>
            {totalDelta.direction !== 'same' && (
              <div className={`team-trends__metric-delta team-trends__metric-delta--${totalDelta.direction}`}>
                {totalDelta.direction === 'up' ? '↑' : '↓'} {totalDelta.delta}
              </div>
            )}
          </div>
          <div className="team-trends__metric">
            <div className="team-trends__metric-value">{ticketsDelta.value}</div>
            <div className="team-trends__metric-label">Tickets</div>
            {ticketsDelta.direction !== 'same' && (
              <div className={`team-trends__metric-delta team-trends__metric-delta--${ticketsDelta.direction === 'up' ? 'down' : 'up'}`}>
                {ticketsDelta.direction === 'up' ? '↑' : '↓'} {ticketsDelta.delta}
              </div>
            )}
          </div>
          <div className="team-trends__metric">
            <div className="team-trends__metric-value">{avgVelocity}</div>
            <div className="team-trends__metric-label">Avg Velocity</div>
            <div className="team-trends__metric-note">({velocityData.length} sprints)</div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="team-trends__charts">
        {/* Velocity Line Chart */}
        <div className="team-trends__chart">
          <h4 className="team-trends__subtitle">Team Velocity</h4>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={velocityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dfe1e6" />
              <XAxis
                dataKey="sprintName"
                tick={{ fontSize: 12 }}
                stroke="#5e6c84"
              />
              <YAxis tick={{ fontSize: 12 }} stroke="#5e6c84" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #dfe1e6',
                  borderRadius: '4px',
                }}
                formatter={(value) => [`${value} pts`, 'Total Points']}
              />
              <ReferenceLine
                y={avgVelocity}
                stroke="#5e6c84"
                strokeDasharray="3 3"
                label={{ value: `Avg: ${avgVelocity}`, position: 'right', fontSize: 11, fill: '#5e6c84' }}
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke="#0052cc"
                strokeWidth={2}
                dot={{ fill: '#0052cc', strokeWidth: 2, r: 4 }}
                name="Total Points"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Tickets Bar Chart */}
        <div className="team-trends__chart">
          <h4 className="team-trends__subtitle">Tickets Completed</h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={velocityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dfe1e6" />
              <XAxis
                dataKey="sprintName"
                tick={{ fontSize: 12 }}
                stroke="#5e6c84"
              />
              <YAxis tick={{ fontSize: 12 }} stroke="#5e6c84" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #dfe1e6',
                  borderRadius: '4px',
                }}
                formatter={(value) => [`${value} tickets`, 'Completed']}
              />
              <ReferenceLine
                y={avgTickets}
                stroke="#5e6c84"
                strokeDasharray="3 3"
                label={{ value: `Avg: ${avgTickets}`, position: 'right', fontSize: 11, fill: '#5e6c84' }}
              />
              <Bar
                dataKey="devCount"
                fill="#0052cc"
                name="Tickets"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
