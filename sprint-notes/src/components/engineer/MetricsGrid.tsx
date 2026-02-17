import type { EngineerMetrics } from '../../types';
import { DevReviewRatioBar } from '../common';
import './MetricsGrid.css';

interface MetricsGridProps {
  metrics: EngineerMetrics;
}

interface MetricCardProps {
  label: string;
  value: number;
  suffix?: string;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'secondary' | 'muted';
}

function MetricCard({ label, value, suffix = '', variant = 'default' }: MetricCardProps) {
  return (
    <div className={`metric-card metric-card--${variant}`}>
      <div className="metric-card__value">
        {value}
        {suffix && <span className="metric-card__suffix">{suffix}</span>}
      </div>
      <div className="metric-card__label">{label}</div>
    </div>
  );
}

export function MetricsGrid({ metrics }: MetricsGridProps) {
  return (
    <div className="metrics-grid-container">
      <div className="metrics-grid">
        <MetricCard
          label="Dev Count"
          value={metrics.devCount}
          variant="success"
        />
        <MetricCard
          label="Dev Points"
          value={metrics.devPts}
          suffix="pts"
          variant="success"
        />
        <MetricCard
          label="Review Count"
          value={metrics.reviewCount}
          variant="secondary"
        />
        <MetricCard
          label="Review Points"
          value={metrics.reviewPts}
          suffix="pts"
          variant="secondary"
        />
        <MetricCard
          label="IT Tickets"
          value={metrics.itCount}
          variant="warning"
        />
        <MetricCard
          label="Total Pts"
          value={metrics.devPts + metrics.reviewPts}
          suffix="pts"
          variant="muted"
        />
      </div>
      <div className="metrics-grid__ratio">
        <DevReviewRatioBar devPts={metrics.devPts} reviewPts={metrics.reviewPts} />
      </div>
    </div>
  );
}
