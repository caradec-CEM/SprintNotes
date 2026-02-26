import { create } from 'zustand';
import type { Sprint, SprintData, Ticket } from '../types';

interface SprintState {
  // Available sprints from JIRA
  sprints: Sprint[];
  sprintsLoading: boolean;
  sprintsError: string | null;

  // Currently selected sprint
  selectedSprintId: string | null;

  // Current sprint data
  currentSprint: SprintData | null;
  ticketsLoading: boolean;
  ticketsError: string | null;

  // In-flight tickets (non-done) for active sprints
  inFlightTickets: Ticket[];
  inFlightLoading: boolean;

  // Actions
  setSprints: (sprints: Sprint[]) => void;
  setSprintsLoading: (loading: boolean) => void;
  setSprintsError: (error: string | null) => void;

  setSelectedSprintId: (id: string | null) => void;

  setCurrentSprint: (data: SprintData | null) => void;
  setTicketsLoading: (loading: boolean) => void;
  setTicketsError: (error: string | null) => void;

  setInFlightTickets: (tickets: Ticket[]) => void;
  setInFlightLoading: (loading: boolean) => void;
}

export const useSprintStore = create<SprintState>((set) => ({
  // Initial state
  sprints: [],
  sprintsLoading: false,
  sprintsError: null,

  selectedSprintId: null,

  currentSprint: null,
  ticketsLoading: false,
  ticketsError: null,

  inFlightTickets: [],
  inFlightLoading: false,

  // Actions
  setSprints: (sprints) => set({ sprints }),
  setSprintsLoading: (sprintsLoading) => set({ sprintsLoading }),
  setSprintsError: (sprintsError) => set({ sprintsError }),

  setSelectedSprintId: (selectedSprintId) => set({ selectedSprintId }),

  setCurrentSprint: (currentSprint) => set({ currentSprint }),
  setTicketsLoading: (ticketsLoading) => set({ ticketsLoading }),
  setTicketsError: (ticketsError) => set({ ticketsError }),

  setInFlightTickets: (inFlightTickets) => set({ inFlightTickets }),
  setInFlightLoading: (inFlightLoading) => set({ inFlightLoading }),
}));

// Selector hooks for computed values
export function useSelectedSprint(): Sprint | undefined {
  const sprints = useSprintStore((state) => state.sprints);
  const selectedSprintId = useSprintStore((state) => state.selectedSprintId);
  return sprints.find((s) => s.id === selectedSprintId);
}

export function useEngineerTickets(engineerId: string): Ticket[] {
  const currentSprint = useSprintStore((state) => state.currentSprint);
  if (!currentSprint) return [];

  return currentSprint.tickets.filter(
    (t) => t.developer === engineerId || t.reviewer === engineerId || t.assignee === engineerId
  );
}
