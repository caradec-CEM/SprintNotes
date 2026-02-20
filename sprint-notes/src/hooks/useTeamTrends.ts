import { useMemo } from 'react';
import { useHistoryStore } from '../stores/historyStore';
import { useSprintStore } from '../stores/sprintStore';
import { useNotesStore } from '../stores/notesStore';
import { TEAM_MEMBERS } from '../config/team';
import { computeTeamCapacityPercent, computeNormalizedVelocity } from '../utils/capacityUtils';

export interface TeamVelocityDataPoint {
  sprintId: string;
  sprintName: string;
  devPts: number;
  reviewPts: number;
  total: number;
  devCount: number;
  reviewCount: number;
  itCount: number;
  capacityPercent: number;
  normalizedTotal: number | null;
}

export interface TeamTrendData {
  velocityData: TeamVelocityDataPoint[];
  currentVsPrevious: {
    current: TeamVelocityDataPoint | undefined;
    previous: TeamVelocityDataPoint | undefined;
  };
}

// Extract sprint number from name (e.g., "Engineering Sprint 54" -> 54)
function getSprintNum(name: string): number {
  const match = name.match(/Sprint\s+(\d+)/i);
  return match ? parseInt(match[1]) : 0;
}

export function useTeamTrends(sprintCount = 6): TeamTrendData {
  const history = useHistoryStore((state) => state.history);
  const selectedSprintId = useSprintStore((state) => state.selectedSprintId);
  const getSprintCapacity = useNotesStore((state) => state.getSprintCapacity);
  const getEngineerTimeOff = useNotesStore((state) => state.getEngineerTimeOff);

  return useMemo(() => {
    // Find the selected sprint in history
    const selectedSprint = history.sprints.find(s => s.id === selectedSprintId);
    const selectedSprintNum = selectedSprint ? getSprintNum(selectedSprint.name) : 0;

    // Filter to sprints <= selected sprint number, sorted by sprint number
    const relevantSprints = history.sprints
      .filter(s => getSprintNum(s.name) <= selectedSprintNum)
      .sort((a, b) => getSprintNum(a.name) - getSprintNum(b.name))
      .slice(-sprintCount);

    const velocityData: TeamVelocityDataPoint[] = relevantSprints.map((sprint) => {
      // Aggregate metrics across all team members (for individual breakdowns)
      let devPts = 0;
      let reviewPts = 0;
      let devCount = 0;
      let reviewCount = 0;
      let itCount = 0;

      for (const member of TEAM_MEMBERS) {
        const metrics = sprint.engineers[member.id];
        if (metrics) {
          devPts += metrics.devPts;
          reviewPts += metrics.reviewPts;
          devCount += metrics.devCount;
          reviewCount += metrics.reviewCount;
          itCount += metrics.itCount;
        }
      }

      // Use actual totals from sprint summary (not derived from engineer metrics)
      const total = sprint.totalPoints ?? reviewPts;  // Fallback for old data
      const ticketCount = sprint.totalTickets ?? reviewCount;

      // Capacity data from notesStore
      const sprintCapacity = getSprintCapacity(sprint.id);
      const engineerTimeOffs = TEAM_MEMBERS.map((m) =>
        getEngineerTimeOff(sprint.id, m.id)
      );
      const capacityPercent = computeTeamCapacityPercent(engineerTimeOffs, sprintCapacity.effectiveSprintDays);
      const normalizedTotal = computeNormalizedVelocity(total, capacityPercent);

      return {
        sprintId: sprint.id,
        sprintName: sprint.name.replace('Engineering Sprint ', 'S'),
        devPts,
        reviewPts,
        total,
        devCount: ticketCount,  // Use actual ticket count for team display
        reviewCount,
        itCount,
        capacityPercent,
        normalizedTotal: normalizedTotal !== null ? Math.round(normalizedTotal) : null,
      };
    });

    // Current vs previous comparison
    const current = velocityData[velocityData.length - 1];
    const previous = velocityData[velocityData.length - 2];

    return {
      velocityData,
      currentVsPrevious: {
        current,
        previous,
      },
    };
  }, [sprintCount, history.sprints, selectedSprintId, getSprintCapacity, getEngineerTimeOff]);
}

// Helper to calculate delta between two team metrics
export function calculateTeamDelta(
  current: TeamVelocityDataPoint | undefined,
  previous: TeamVelocityDataPoint | undefined,
  key: keyof TeamVelocityDataPoint
): { value: number; delta: number; direction: 'up' | 'down' | 'same' } {
  const currentValue = (current?.[key] as number) ?? 0;
  const previousValue = (previous?.[key] as number) ?? 0;
  const delta = currentValue - previousValue;

  return {
    value: currentValue,
    delta: Math.abs(delta),
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'same',
  };
}
