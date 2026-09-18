import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useSprintStore } from '../../stores/sprintStore';
import { useChartColors } from '../../hooks/useChartColors';
import type { BurnUpPoint } from '../../types';
import './BurnUpChart.css';

export function BurnUpChart() {
  const burnUpData = useSprintStore((s) => s.burnUpData);
  const cc = useChartColors();

  if (burnUpData.length < 2) {
    return (
      <div className="burn-up__empty">
        No burn-up data for this sprint yet. (Needs sprint start/end dates and ticket history from JIRA.)
      </div>
    );
  }

  const finalScope = burnUpData[burnUpData.length - 1].scope;
  const startScope = burnUpData[0].scope;
  const scopeAdded = Math.round((finalScope - startScope) * 10) / 10;
  const todayLabel = burnUpData.find((p) => p.isToday)?.label;

  const N = burnUpData.length;
  const todayIdx = burnUpData.findIndex((p) => p.isToday);

  // Ideal (guideline): 0 at start → full scope on the last day.
  // Projection (active sprints): extend today's completed at the current daily
  // pace out to sprint end.
  const completedToday = todayIdx >= 0 ? burnUpData[todayIdx].completed : NaN;
  const projecting = todayIdx > 0 && todayIdx < N - 1 && !Number.isNaN(completedToday);
  const rate = projecting ? completedToday / todayIdx : 0;

  const data = burnUpData.map((p, i) => ({
    ...p,
    ideal: N > 1 ? Math.round((finalScope * i) / (N - 1) * 10) / 10 : 0,
    projected: projecting && i >= todayIdx
      ? Math.round((completedToday + rate * (i - todayIdx)) * 10) / 10
      : undefined,
  }));

  const projectedEnd = projecting ? data[N - 1].projected ?? 0 : null;

  // Ahead/behind pace: latest real completed vs the ideal at that same day.
  const lastRealIdx = (() => {
    for (let i = data.length - 1; i >= 0; i--) if (!Number.isNaN(data[i].completed)) return i;
    return data.length - 1;
  })();
  const completedPts = data[lastRealIdx]?.completed ?? 0;
  const vsIdeal = Math.round((completedPts - (data[lastRealIdx]?.ideal ?? 0)) * 10) / 10;

  return (
    <div className="burn-up">
      <div className="burn-up__stats">
        <span className="burn-up__stat">
          Scope <strong>{finalScope}</strong> pts
          {scopeAdded !== 0 && (
            <span className={`burn-up__delta burn-up__delta--${scopeAdded > 0 ? 'up' : 'down'}`}>
              {scopeAdded > 0 ? '+' : ''}{scopeAdded} vs start
            </span>
          )}
        </span>
        <span className="burn-up__stat">
          Completed <strong>{completedPts}</strong> pts
          {vsIdeal !== 0 && (
            <span className={`burn-up__delta burn-up__delta--${vsIdeal > 0 ? 'down' : 'up'}`}>
              {vsIdeal > 0 ? '+' : ''}{vsIdeal} vs ideal
            </span>
          )}
        </span>
        {projectedEnd !== null && (
          <span className="burn-up__stat">
            Projected <strong>~{projectedEnd}</strong> of {finalScope} pts at current pace
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={420}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={cc.grid} />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke={cc.axis} minTickGap={16} />
          <YAxis tick={{ fontSize: 12 }} stroke={cc.axis} />
          <Tooltip content={<BurnUpTooltip cc={cc} />} />
          {todayLabel && (
            <ReferenceLine x={todayLabel} stroke={cc.axis} strokeDasharray="2 4"
              label={{ value: 'today', position: 'top', fontSize: 10, fill: cc.axis }} />
          )}
          {/* Ideal guideline */}
          <Line type="linear" dataKey="ideal" name="ideal" stroke={cc.axis}
            strokeWidth={1.5} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
          {/* Scope — steps, with a marker on days something changed */}
          <Line
            type="stepAfter"
            dataKey="scope"
            name="scope"
            stroke={cc.expected}
            strokeWidth={2}
            isAnimationActive={false}
            dot={(props) => <ScopeDot {...props} cc={cc} />}
            activeDot={{ r: 4 }}
          />
          {/* Cumulative completed */}
          <Line type="monotone" dataKey="completed" name="completed" stroke={cc.primary}
            strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
          {/* At-pace projection (active sprints) */}
          {projecting && (
            <Line type="linear" dataKey="projected" name="projected" stroke={cc.primary}
              strokeWidth={2} strokeDasharray="4 4" strokeOpacity={0.5} dot={false}
              connectNulls={false} isAnimationActive={false} />
          )}
        </LineChart>
      </ResponsiveContainer>

      <p className="burn-up__method">
        Scope = committed points per day (steps with mid-sprint add/remove/re-point; dots mark those days — hover for details).
        Completed = points on the day a ticket first entered a Done status.
        Ideal = steady pace to finish all scope by sprint end.
        {projectedEnd !== null && ' Dashed projection extends today’s pace to sprint end.'}
      </p>
    </div>
  );
}

// Marker dot on the scope line, shown only on days scope changed.
function ScopeDot(props: { cx?: number; cy?: number; payload?: BurnUpPoint; cc: ReturnType<typeof useChartColors>; index?: number }) {
  const { cx, cy, payload, cc, index } = props;
  if (cx == null || cy == null || !payload?.scopeChanges?.length) {
    return <circle key={index} r={0} />;
  }
  return <circle key={index} cx={cx} cy={cy} r={4} fill={cc.expected} stroke={cc.tooltipBg} strokeWidth={1.5} />;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: BurnUpPoint & { ideal?: number; projected?: number } }>;
  label?: string;
  cc: ReturnType<typeof useChartColors>;
}

function BurnUpTooltip({ active, payload, label, cc }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const row = (name: string, val: number | undefined, color: string) =>
    val == null || Number.isNaN(val) ? null : (
      <div style={{ color }}>{name}: {val} pts</div>
    );
  return (
    <div style={{
      background: cc.tooltipBg, border: `1px solid ${cc.tooltipBorder}`,
      borderRadius: 4, padding: '8px 10px', color: cc.text, fontSize: 12, maxWidth: 260,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {row('Scope', p.scope, cc.expected)}
      {row('Completed', p.completed, cc.primary)}
      {row('Ideal', p.ideal, cc.axis)}
      {row('Projected', p.projected, cc.primary)}
      {p.scopeChanges?.length ? (
        <div style={{ marginTop: 6, borderTop: `1px solid ${cc.tooltipBorder}`, paddingTop: 6 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Scope changes</div>
          {p.scopeChanges.map((c, i) => (
            <div key={i}>
              {c.key}: {c.kind}
              {c.kind === 'repointed' ? ` ${c.from}→${c.to}` : ''}
              {' '}({c.delta > 0 ? '+' : ''}{c.delta})
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
