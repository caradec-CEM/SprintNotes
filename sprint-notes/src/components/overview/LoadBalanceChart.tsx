import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useSprintStore } from '../../stores/sprintStore';
import { useNotesStore } from '../../stores/notesStore';
import { TEAM_MEMBERS } from '../../config/team';
import { calculateEngineerMetrics } from '../../stores/historyStore';
import './LoadBalanceChart.css';

export function LoadBalanceChart() {
  const currentSprint = useSprintStore((state) => state.currentSprint);
  const getEngineerTimeOff = useNotesStore((state) => state.getEngineerTimeOff);

  if (!currentSprint) {
    return <div className="load-balance-chart__empty">No sprint data loaded</div>;
  }

  // Calculate metrics for each team member
  const data = TEAM_MEMBERS.map((member) => {
    const metrics = calculateEngineerMetrics(member.id, currentSprint.tickets);
    const timeOff = getEngineerTimeOff(currentSprint.id, member.id);
    return {
      name: member.name.split(' ')[0], // First name only
      devPts: metrics.devPts,
      reviewPts: metrics.reviewPts,
      total: metrics.devPts + metrics.reviewPts,
      ptoDays: timeOff.ptoDays,
      ptoLabel: timeOff.ptoDays > 0 ? `(${timeOff.ptoDays}d PTO)` : '',
    };
  }).sort((a, b) => b.total - a.total); // Sort by total descending

  return (
    <div className="load-balance-chart">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 10, right: 30, left: 60, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#dfe1e6" />
          <XAxis type="number" tick={{ fontSize: 12 }} stroke="#5e6c84" />
          <YAxis
            type="category"
            dataKey="name"
            tick={(props) => {
              const { x, y, payload } = props;
              const item = data.find((d) => d.name === payload.value);
              return (
                <g transform={`translate(${x},${y})`}>
                  <text x={0} y={0} dy={4} textAnchor="end" fill="#5e6c84" fontSize={12}>
                    {payload.value}
                  </text>
                  {item?.ptoDays && item.ptoDays > 0 && (
                    <text x={0} y={12} textAnchor="end" fill="#b38600" fontSize={10}>
                      {item.ptoLabel}
                    </text>
                  )}
                </g>
              );
            }}
            stroke="#5e6c84"
            width={80}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #dfe1e6',
              borderRadius: '4px',
            }}
            formatter={(value, name) => [
              `${value} pts`,
              name === 'devPts' ? 'Dev Points' : 'Review Points',
            ]}
          />
          <Legend
            formatter={(value) =>
              value === 'devPts' ? 'Dev Points' : 'Review Points'
            }
          />
          <Bar dataKey="devPts" stackId="a" fill="#36b37e" name="devPts" />
          <Bar dataKey="reviewPts" stackId="a" fill="#4c9aff" name="reviewPts" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
