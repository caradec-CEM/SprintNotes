import { useState } from 'react';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { useIndividualTrends, calculateDelta } from '../../hooks/useIndividualTrends';
import { useChartColors } from '../../hooks/useChartColors';
import './IndividualTrends.css';

interface IndividualTrendsProps {
  engineerId: string;
}

export function IndividualTrends({ engineerId }: IndividualTrendsProps) {
  const { velocityData, currentVsPrevious } = useIndividualTrends(engineerId, 6);
  const cc = useChartColors();
  const [showNormalized, setShowNormalized] = useState(true);

  if (velocityData.length < 2) {
    return (
      <div className="individual-trends__empty">
        Not enough sprint history for trends. Data will appear after 2+ sprints.
      </div>
    );
  }

  const { current, previous } = currentVsPrevious;

  // Calculate deltas for comparison
  const devPtsDelta = calculateDelta(current, previous, 'devPts');
  const reviewPtsDelta = calculateDelta(current, previous, 'reviewPts');
  const totalValue = (current?.devPts ?? 0) + (current?.reviewPts ?? 0);
  const previousValue = (previous?.devPts ?? 0) + (previous?.reviewPts ?? 0);
  const totalDeltaValue = Math.abs(totalValue - previousValue);
  const totalDirection: 'up' | 'down' | 'same' =
    totalValue > previousValue ? 'up' : totalValue < previousValue ? 'down' : 'same';

  const totalDelta = {
    value: totalValue,
    delta: totalDeltaValue,
    direction: totalDirection,
  };

  // Check if any sprint has capacity < 100%
  const hasCapacityVariation = velocityData.some((d) => d.capacityPercent < 100);

  return (
    <div className="individual-trends">
      {/* Sprint Comparison */}
      <div className="individual-trends__comparison">
        <h4 className="individual-trends__subtitle">vs Previous Sprint</h4>
        <div className="comparison-grid">
          <ComparisonCard
            label="Dev Points"
            current={devPtsDelta.value}
            delta={devPtsDelta.delta}
            direction={devPtsDelta.direction}
            variant="dev"
          />
          <ComparisonCard
            label="Review Points"
            current={reviewPtsDelta.value}
            delta={reviewPtsDelta.delta}
            direction={reviewPtsDelta.direction}
            variant="review"
          />
          <ComparisonCard
            label="Total Points"
            current={totalDelta.value}
            delta={totalDelta.delta}
            direction={totalDelta.direction}
            variant="muted"
          />
        </div>
      </div>

      {/* Charts */}
      <div className="individual-trends__charts">
        {/* Velocity Line Chart */}
        <div className="individual-trends__chart">
          <div className="individual-trends__chart-header">
            <h4 className="individual-trends__subtitle">Velocity Trend</h4>
            {hasCapacityVariation && (
              <label className="individual-trends__toggle">
                <input
                  type="checkbox"
                  checked={showNormalized}
                  onChange={(e) => setShowNormalized(e.target.checked)}
                />
                <span>Show adjusted</span>
              </label>
            )}
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={velocityData}>
              <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} />
              <XAxis
                dataKey="sprintName"
                tick={{ fontSize: 12 }}
                stroke={cc.axis}
              />
              <YAxis tick={{ fontSize: 12 }} stroke={cc.axis} />
              <Tooltip
                contentStyle={{
                  backgroundColor: cc.tooltipBg,
                  border: `1px solid ${cc.tooltipBorder}`,
                  borderRadius: '4px',
                  color: cc.text,
                }}
                labelStyle={{ color: cc.text }}
                itemStyle={{ color: cc.text }}
                labelFormatter={(label, payload) => {
                  const item = payload?.[0]?.payload;
                  if (item && item.capacityPercent < 100) {
                    return `${label} (${item.capacityPercent}% capacity)`;
                  }
                  return label;
                }}
              />
              <Legend wrapperStyle={{ color: cc.text }} />
              <Line
                type="monotone"
                dataKey="total"
                stroke={cc.primary}
                strokeWidth={2}
                dot={{ fill: cc.primary, strokeWidth: 2, r: 4 }}
                name="Total Points"
              />
              <Line
                type="monotone"
                dataKey="devPts"
                stroke={cc.dev}
                strokeWidth={1}
                dot={{ fill: cc.dev, strokeWidth: 1, r: 2 }}
                name="Dev Points"
              />
              <Line
                type="monotone"
                dataKey="reviewPts"
                stroke={cc.review}
                strokeWidth={1}
                strokeDasharray="5 5"
                dot={{ fill: cc.review, strokeWidth: 1, r: 2 }}
                name="Review Points"
              />
              {showNormalized && (
                <Line
                  type="monotone"
                  dataKey="normalizedTotal"
                  stroke={cc.normalized}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ fill: cc.normalized, strokeWidth: 2, r: 3 }}
                  name="Adjusted"
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Dev/Review Balance Stacked Bar */}
        <div className="individual-trends__chart">
          <h4 className="individual-trends__subtitle">Dev / Review Balance</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={velocityData}>
              <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} />
              <XAxis
                dataKey="sprintName"
                tick={{ fontSize: 12 }}
                stroke={cc.axis}
              />
              <YAxis tick={{ fontSize: 12 }} stroke={cc.axis} />
              <Tooltip
                contentStyle={{
                  backgroundColor: cc.tooltipBg,
                  border: `1px solid ${cc.tooltipBorder}`,
                  borderRadius: '4px',
                  color: cc.text,
                }}
                labelStyle={{ color: cc.text }}
                itemStyle={{ color: cc.text }}
                cursor={{ fill: cc.cursorFill }}
                labelFormatter={(label, payload) => {
                  const item = payload?.[0]?.payload;
                  if (item && item.capacityPercent < 100) {
                    return `${label} (${item.capacityPercent}% capacity)`;
                  }
                  return label;
                }}
              />
              <Legend wrapperStyle={{ color: cc.text }} />
              <Bar
                dataKey="devPts"
                stackId="a"
                fill={cc.dev}
                name="Dev Points"
              >
                {velocityData.map((entry, index) => (
                  <Cell
                    key={index}
                    fillOpacity={entry.capacityPercent < 100 ? 0.5 : 1}
                  />
                ))}
              </Bar>
              <Bar
                dataKey="reviewPts"
                stackId="a"
                fill={cc.review}
                name="Review Points"
              >
                {velocityData.map((entry, index) => (
                  <Cell
                    key={index}
                    fillOpacity={entry.capacityPercent < 100 ? 0.5 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

interface ComparisonCardProps {
  label: string;
  current: number;
  delta: number;
  direction: 'up' | 'down' | 'same';
  variant?: 'default' | 'dev' | 'review' | 'muted';
}

function ComparisonCard({ label, current, delta, direction, variant = 'default' }: ComparisonCardProps) {
  return (
    <div className={`comparison-card comparison-card--${variant}`}>
      <div className="comparison-card__label">{label}</div>
      <div className="comparison-card__value">{current}</div>
      {direction !== 'same' && (
        <div className={`comparison-card__delta comparison-card__delta--${direction}`}>
          {direction === 'up' ? '↑' : '↓'} {delta}
        </div>
      )}
    </div>
  );
}
