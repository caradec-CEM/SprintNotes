import './DevReviewRatioBar.css';

interface DevReviewRatioBarProps {
  devPts: number;
  reviewPts: number;
  showLabels?: boolean;
  size?: 'sm' | 'md';
}

export function DevReviewRatioBar({
  devPts,
  reviewPts,
  showLabels = true,
  size = 'md',
}: DevReviewRatioBarProps) {
  const total = devPts + reviewPts;

  if (total === 0) {
    return (
      <div className={`ratio-bar ratio-bar--${size}`}>
        <div className="ratio-bar__empty">No points</div>
      </div>
    );
  }

  const devPercent = Math.round((devPts / total) * 100);
  const reviewPercent = 100 - devPercent;

  return (
    <div className={`ratio-bar ratio-bar--${size}`}>
      {showLabels && (
        <div className="ratio-bar__labels">
          <span className="ratio-bar__label ratio-bar__label--dev">
            {devPts} dev ({devPercent}%)
          </span>
          <span className="ratio-bar__label ratio-bar__label--review">
            {reviewPts} review ({reviewPercent}%)
          </span>
        </div>
      )}
      <div className="ratio-bar__track">
        {devPercent > 0 && (
          <div
            className="ratio-bar__segment ratio-bar__segment--dev"
            style={{ width: `${devPercent}%` }}
          />
        )}
        {reviewPercent > 0 && (
          <div
            className="ratio-bar__segment ratio-bar__segment--review"
            style={{ width: `${reviewPercent}%` }}
          />
        )}
      </div>
    </div>
  );
}
