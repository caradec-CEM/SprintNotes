import { useMemo } from 'react';
import { useHistoryStore } from '../stores/historyStore';
import { useSprintStore } from '../stores/sprintStore';
import { useNotesStore } from '../stores/notesStore';
import type { TrendData, VelocityDataPoint, EngineerMetrics } from '../types';
import { DEFAULT_SPRINT_CAPACITY, DEFAULT_TIME_OFF, computeNormalizedVelocity } from '../utils/capacityUtils';

// Extract sprint number from name (e.g., "Engineering Sprint 54" -> 54)
function getSprintNum(name: string): number {
  const match = name.match(/Sprint\s+(\d+)/i);
  return match ? parseInt(match[1]) : 0;
}

export function useIndividualTrends(engineerId: string, sprintCount = 5): TrendData {
  const history = useHistoryStore((state) => state.history);
  const selectedSprintId = useSprintStore((state) => state.selectedSprintId);
  const sprintNotes = useNotesStore((state) => state.sprintNotes);

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
      const total = metrics.devPts + metrics.reviewPts;

      // Capacity data
      const sNotes = sprintNotes[sprint.id];
      const sprintCapacity = sNotes?.capacity ?? DEFAULT_SPRINT_CAPACITY;
      const engineerTimeOff = sNotes?.timeOff?.[engineerId] ?? { ...DEFAULT_TIME_OFF, workingDays: sprintCapacity.effectiveSprintDays };
      const capacityPercent = sprintCapacity.effectiveSprintDays > 0
        ? Math.round((engineerTimeOff.workingDays / sprintCapacity.effectiveSprintDays) * 100)
        : 0;
      const normalizedTotal = computeNormalizedVelocity(total, capacityPercent);

      return {
        sprintId: sprint.id,
        sprintName: sprint.name.replace('Engineering Sprint ', 'S'),
        total,
        devPts: metrics.devPts,
        reviewPts: metrics.reviewPts,
        capacityPercent,
        normalizedTotal: normalizedTotal !== null ? Math.round(normalizedTotal) : null,
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
  }, [engineerId, sprintCount, history.sprints, selectedSprintId, sprintNotes]);
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
