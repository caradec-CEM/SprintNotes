import { useMemo } from 'react';
import { useHistoryStore } from '../stores/historyStore';
import { useSprintStore } from '../stores/sprintStore';
import type { TrendData, VelocityDataPoint, EngineerMetrics } from '../types';

// Extract sprint number from name (e.g., "Engineering Sprint 54" -> 54)
function getSprintNum(name: string): number {
  const match = name.match(/Sprint\s+(\d+)/i);
  return match ? parseInt(match[1]) : 0;
}

export function useIndividualTrends(engineerId: string, sprintCount = 5): TrendData {
  const history = useHistoryStore((state) => state.history);
  const selectedSprintId = useSprintStore((state) => state.selectedSprintId);

  return useMemo(() => {
    // Find the selected sprint in history
    const selectedSprint = history.sprints.find(s => s.id === selectedSprintId);
    const selectedSprintNum = selectedSprint ? getSprintNum(selectedSprint.name) : 0;

    // Filter to sprints <= selected sprint number, sorted by sprint number
    const relevantSprints = history.sprints
      .filter(s => getSprintNum(s.name) <= selectedSprintNum)
      .sort((a, b) => getSprintNum(a.name) - getSprintNum(b.name))
      .slice(-sprintCount); // Take last N (selected + previous)

    const velocityData: VelocityDataPoint[] = relevantSprints.map((sprint) => {
      const metrics = sprint.engineers[engineerId] || {
        devPts: 0,
        reviewPts: 0,
      };
      return {
        sprintId: sprint.id,
        sprintName: sprint.name.replace('Engineering Sprint ', 'S'),
        total: metrics.devPts + metrics.reviewPts,
        devPts: metrics.devPts,
        reviewPts: metrics.reviewPts,
      };
    });

    // Current vs previous comparison
    const currentMetrics = relevantSprints[relevantSprints.length - 1]?.engineers[engineerId];
    const previousMetrics = relevantSprints[relevantSprints.length - 2]?.engineers[engineerId];

    return {
      velocityData,
      currentVsPrevious: {
        current: currentMetrics,
        previous: previousMetrics,
      },
    };
  }, [engineerId, sprintCount, history.sprints, selectedSprintId]);
}

// Helper to calculate delta between two metrics
export function calculateDelta(
  current: EngineerMetrics | undefined,
  previous: EngineerMetrics | undefined,
  key: keyof EngineerMetrics
): { value: number; delta: number; direction: 'up' | 'down' | 'same' } {
  const currentValue = current?.[key] ?? 0;
  const previousValue = previous?.[key] ?? 0;
  const delta = currentValue - previousValue;

  return {
    value: currentValue,
    delta: Math.abs(delta),
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'same',
  };
}
