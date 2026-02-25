import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SprintHistory, SprintSummary, EngineerMetrics, Ticket } from '../types';
import { TEAM_MEMBERS } from '../config/team';

// Calculate metrics for a single engineer from tickets
export function calculateEngineerMetrics(
  engineerId: string,
  tickets: Ticket[]
): EngineerMetrics {
  let devCount = 0;
  let reviewCount = 0;
  let devPts = 0;
  let reviewPts = 0;
  let itCount = 0;

  for (const ticket of tickets) {
    // Dev work (CP project)
    if (ticket.developer === engineerId && ticket.project === 'CP') {
      devCount++;
      devPts += ticket.points;
    }

    // Review work (CP project)
    if (ticket.reviewer === engineerId && ticket.project === 'CP') {
      reviewCount++;
      reviewPts += ticket.points;
    }

    // IT tickets (via assignee)
    if (ticket.assignee === engineerId && ticket.project === 'IT') {
      itCount++;
    }
  }

  return {
    totalItems: devCount + reviewCount + itCount,
    devCount,
    reviewCount,
    devPts,
    reviewPts,
    itCount,
  };
}

// Create sprint summary from sprint data
export function createSprintSummary(
  sprintId: string,
  sprintName: string,
  date: string,
  tickets: Ticket[]
): SprintSummary {
  const engineers: Record<string, EngineerMetrics> = {};

  for (const member of TEAM_MEMBERS) {
    engineers[member.id] = calculateEngineerMetrics(member.id, tickets);
  }

  // Points from CP (story-point based), ticket count from IT (ticket-based)
  const cpTickets = tickets.filter(t => t.project === 'CP');
  const itTickets = tickets.filter(t => t.project === 'IT');
  const totalPoints = cpTickets.reduce((sum, t) => sum + t.points, 0);
  const totalTickets = itTickets.length;

  return {
    id: sprintId,
    name: sprintName,
    date,
    engineers,
    totalPoints,
    totalTickets,
  };
}

interface HistoryState {
  history: SprintHistory;

  // Actions
  addSprintSummary: (summary: SprintSummary) => void;
  getRecentSprints: (count: number, excludeSprintId?: string) => SprintSummary[];
  getEngineerHistory: (
    engineerId: string,
    count: number,
    excludeSprintId?: string
  ) => Array<{ sprint: SprintSummary; metrics: EngineerMetrics }>;
  clearHistory: () => void;
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set, get) => ({
      history: { sprints: [] },

      addSprintSummary: (summary) =>
        set((state) => {
          const existingIdx = state.history.sprints.findIndex(
            (s) => s.id === summary.id
          );

          let newSprints: SprintSummary[];

          if (existingIdx >= 0) {
            // Update existing sprint
            newSprints = [...state.history.sprints];
            newSprints[existingIdx] = summary;
          } else {
            // Add new sprint
            newSprints = [...state.history.sprints, summary];
          }

          // Sort by sprint number from name (e.g., "Engineering Sprint 55" -> 55)
          const getSprintNum = (name: string) => {
            const match = name.match(/Sprint\s+(\d+)/i);
            return match ? parseInt(match[1]) : 0;
          };
          newSprints.sort((a, b) => getSprintNum(a.name) - getSprintNum(b.name));
          if (newSprints.length > 20) {
            newSprints = newSprints.slice(-20);
          }

          return {
            history: { sprints: newSprints },
          };
        }),

      getRecentSprints: (count, excludeSprintId) => {
        const { history } = get();
        let sprints = history.sprints;
        if (excludeSprintId) {
          sprints = sprints.filter(s => s.id !== excludeSprintId);
        }
        return sprints.slice(-count);
      },

      getEngineerHistory: (engineerId, count, excludeSprintId) => {
        const { history } = get();
        let sprints = history.sprints;
        if (excludeSprintId) {
          sprints = sprints.filter(s => s.id !== excludeSprintId);
        }
        return sprints.slice(-count).map((sprint) => ({
          sprint,
          metrics: sprint.engineers[engineerId] || {
            totalItems: 0,
            devCount: 0,
            reviewCount: 0,
            devPts: 0,
            reviewPts: 0,
            itCount: 0,
          },
        }));
      },

      clearHistory: () => set({ history: { sprints: [] } }),
    }),
    {
      name: 'sprint-history-storage',
    }
  )
);
