import { useMemo } from 'react';
import { useHistoryStore } from '../stores/historyStore';
import { getExpectedDays as getHardcodedExpectedDays } from '../utils/dateUtils';

/**
 * Aggregates duration baselines across all stored sprints and returns
 * a getExpectedDays function that uses historical medians when available,
 * falling back to hardcoded thresholds.
 */
export function useDurationBaselines() {
  const sprints = useHistoryStore((state) => state.history.sprints);

  const historicalExpected = useMemo(() => {
    // Collect per-sprint medians for each point size
    const mediansByPoints = new Map<number, number[]>();

    for (const sprint of sprints) {
      if (!sprint.durationBaselines) continue;
      for (const [ptsStr, baseline] of Object.entries(sprint.durationBaselines)) {
        const pts = Number(ptsStr);
        if (!mediansByPoints.has(pts)) {
          mediansByPoints.set(pts, []);
        }
        mediansByPoints.get(pts)!.push(baseline.median);
      }
    }

    // Compute overall median of medians for each point size
    const result = new Map<number, number>();
    for (const [pts, medians] of mediansByPoints) {
      const sorted = [...medians].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const overallMedian = sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
      result.set(pts, overallMedian);
    }

    return result;
  }, [sprints]);

  const getExpectedDays = useMemo(() => {
    return (points: number): number => {
      return historicalExpected.get(points) ?? getHardcodedExpectedDays(points);
    };
  }, [historicalExpected]);

  return { getExpectedDays };
}
