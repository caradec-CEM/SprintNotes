import { create } from 'zustand';
import { persist, type StateStorage } from 'zustand/middleware';
import type { DiscussionNotes, ActionItem, EngineerNotes, SprintNotes, EngineerTimeOff, SprintCapacity } from '../types';
import { DEFAULT_SPRINT_CAPACITY, DEFAULT_TIME_OFF, computeEffectiveSprintDays, computeEngineerWorkingDays } from '../utils/capacityUtils';

// Custom storage adapter that persists to data/notes.json via the Vite dev server API
const jsonFileStorage: StateStorage = {
  getItem: async () => {
    try {
      const res = await fetch('/api/notes');
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  },
  setItem: async (_name: string, value: string) => {
    try {
      await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: value,
      });
    } catch {
      // API unreachable (e.g. production build) — silently ignore
    }
  },
  removeItem: async () => {
    try {
      await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: '{}',
      });
    } catch {
      // ignore
    }
  },
};

// Helper to create empty notes for an engineer
function createEmptyEngineerNotes(): EngineerNotes {
  return {
    discussion: {
      sprintFeedback: '',
      longerThanExpected: '',
      blockers: '',
      other: '',
    },
    actionItems: [],
  };
}

// Helper to generate unique ID for action items
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

interface NotesState {
  // Notes keyed by sprint ID
  sprintNotes: Record<string, SprintNotes>;

  // Actions
  getEngineerNotes: (sprintId: string, engineerId: string) => EngineerNotes;
  updateDiscussion: (
    sprintId: string,
    engineerId: string,
    field: keyof DiscussionNotes,
    value: string
  ) => void;
  addActionItem: (sprintId: string, engineerId: string, text: string) => void;
  updateActionItem: (
    sprintId: string,
    engineerId: string,
    itemId: string,
    updates: Partial<ActionItem>
  ) => void;
  deleteActionItem: (sprintId: string, engineerId: string, itemId: string) => void;
  toggleActionItem: (sprintId: string, engineerId: string, itemId: string) => void;

  // Time off tracking
  getEngineerTimeOff: (sprintId: string, engineerId: string) => EngineerTimeOff;
  updateEngineerTimeOff: (sprintId: string, engineerId: string, ptoDays: number) => void;

  // Sprint capacity
  getSprintCapacity: (sprintId: string) => SprintCapacity;
  updateSprintCapacity: (sprintId: string, updates: Partial<Pick<SprintCapacity, 'defaultWorkingDays' | 'teamHolidays'>>) => void;
}

export const useNotesStore = create<NotesState>()(
  persist(
    (set, get) => ({
      sprintNotes: {},

      getEngineerNotes: (sprintId, engineerId) => {
        const { sprintNotes } = get();
        const sprint = sprintNotes[sprintId];
        if (!sprint || !sprint.engineers[engineerId]) {
          return createEmptyEngineerNotes();
        }
        return sprint.engineers[engineerId];
      },

      updateDiscussion: (sprintId, engineerId, field, value) =>
        set((state) => {
          const existingSprint = state.sprintNotes[sprintId] || {
            sprintId,
            lastModified: Date.now(),
            engineers: {},
          };

          const existingNotes =
            existingSprint.engineers[engineerId] || createEmptyEngineerNotes();

          return {
            sprintNotes: {
              ...state.sprintNotes,
              [sprintId]: {
                ...existingSprint,
                lastModified: Date.now(),
                engineers: {
                  ...existingSprint.engineers,
                  [engineerId]: {
                    ...existingNotes,
                    discussion: {
                      ...existingNotes.discussion,
                      [field]: value,
                    },
                  },
                },
              },
            },
          };
        }),

      addActionItem: (sprintId, engineerId, text) =>
        set((state) => {
          const existingSprint = state.sprintNotes[sprintId] || {
            sprintId,
            lastModified: Date.now(),
            engineers: {},
          };

          const existingNotes =
            existingSprint.engineers[engineerId] || createEmptyEngineerNotes();

          const newItem: ActionItem = {
            id: generateId(),
            text,
            completed: false,
          };

          return {
            sprintNotes: {
              ...state.sprintNotes,
              [sprintId]: {
                ...existingSprint,
                lastModified: Date.now(),
                engineers: {
                  ...existingSprint.engineers,
                  [engineerId]: {
                    ...existingNotes,
                    actionItems: [...existingNotes.actionItems, newItem],
                  },
                },
              },
            },
          };
        }),

      updateActionItem: (sprintId, engineerId, itemId, updates) =>
        set((state) => {
          const existingSprint = state.sprintNotes[sprintId];
          if (!existingSprint) return state;

          const existingNotes = existingSprint.engineers[engineerId];
          if (!existingNotes) return state;

          return {
            sprintNotes: {
              ...state.sprintNotes,
              [sprintId]: {
                ...existingSprint,
                lastModified: Date.now(),
                engineers: {
                  ...existingSprint.engineers,
                  [engineerId]: {
                    ...existingNotes,
                    actionItems: existingNotes.actionItems.map((item) =>
                      item.id === itemId ? { ...item, ...updates } : item
                    ),
                  },
                },
              },
            },
          };
        }),

      deleteActionItem: (sprintId, engineerId, itemId) =>
        set((state) => {
          const existingSprint = state.sprintNotes[sprintId];
          if (!existingSprint) return state;

          const existingNotes = existingSprint.engineers[engineerId];
          if (!existingNotes) return state;

          return {
            sprintNotes: {
              ...state.sprintNotes,
              [sprintId]: {
                ...existingSprint,
                lastModified: Date.now(),
                engineers: {
                  ...existingSprint.engineers,
                  [engineerId]: {
                    ...existingNotes,
                    actionItems: existingNotes.actionItems.filter(
                      (item) => item.id !== itemId
                    ),
                  },
                },
              },
            },
          };
        }),

      toggleActionItem: (sprintId, engineerId, itemId) =>
        set((state) => {
          const existingSprint = state.sprintNotes[sprintId];
          if (!existingSprint) return state;

          const existingNotes = existingSprint.engineers[engineerId];
          if (!existingNotes) return state;

          return {
            sprintNotes: {
              ...state.sprintNotes,
              [sprintId]: {
                ...existingSprint,
                lastModified: Date.now(),
                engineers: {
                  ...existingSprint.engineers,
                  [engineerId]: {
                    ...existingNotes,
                    actionItems: existingNotes.actionItems.map((item) =>
                      item.id === itemId
                        ? { ...item, completed: !item.completed }
                        : item
                    ),
                  },
                },
              },
            },
          };
        }),

      getEngineerTimeOff: (sprintId, engineerId) => {
        const { sprintNotes } = get();
        const sprint = sprintNotes[sprintId];
        if (!sprint || !sprint.timeOff || !sprint.timeOff[engineerId]) {
          const capacity = sprint?.capacity ?? DEFAULT_SPRINT_CAPACITY;
          return { ptoDays: 0, workingDays: capacity.effectiveSprintDays };
        }
        return sprint.timeOff[engineerId];
      },

      updateEngineerTimeOff: (sprintId, engineerId, ptoDays) =>
        set((state) => {
          const existingSprint = state.sprintNotes[sprintId] || {
            sprintId,
            lastModified: Date.now(),
            engineers: {},
          };

          const capacity = existingSprint.capacity ?? DEFAULT_SPRINT_CAPACITY;
          const workingDays = computeEngineerWorkingDays(capacity.effectiveSprintDays, ptoDays);

          return {
            sprintNotes: {
              ...state.sprintNotes,
              [sprintId]: {
                ...existingSprint,
                lastModified: Date.now(),
                timeOff: {
                  ...existingSprint.timeOff,
                  [engineerId]: {
                    ptoDays,
                    workingDays,
                  },
                },
              },
            },
          };
        }),

      getSprintCapacity: (sprintId) => {
        const { sprintNotes } = get();
        const sprint = sprintNotes[sprintId];
        return sprint?.capacity ?? DEFAULT_SPRINT_CAPACITY;
      },

      updateSprintCapacity: (sprintId, updates) =>
        set((state) => {
          const existingSprint = state.sprintNotes[sprintId] || {
            sprintId,
            lastModified: Date.now(),
            engineers: {},
          };

          const prev = existingSprint.capacity ?? DEFAULT_SPRINT_CAPACITY;
          const defaultWorkingDays = updates.defaultWorkingDays ?? prev.defaultWorkingDays;
          const teamHolidays = updates.teamHolidays ?? prev.teamHolidays;
          const effectiveSprintDays = computeEffectiveSprintDays(defaultWorkingDays, teamHolidays);

          // Recompute all engineer workingDays for this sprint
          const updatedTimeOff: Record<string, EngineerTimeOff> = {};
          if (existingSprint.timeOff) {
            for (const [engId, to] of Object.entries(existingSprint.timeOff)) {
              updatedTimeOff[engId] = {
                ptoDays: to.ptoDays,
                workingDays: computeEngineerWorkingDays(effectiveSprintDays, to.ptoDays),
              };
            }
          }

          return {
            sprintNotes: {
              ...state.sprintNotes,
              [sprintId]: {
                ...existingSprint,
                lastModified: Date.now(),
                capacity: { defaultWorkingDays, teamHolidays, effectiveSprintDays },
                timeOff: Object.keys(updatedTimeOff).length > 0 ? updatedTimeOff : existingSprint.timeOff,
              },
            },
          };
        }),
    }),
    {
      name: 'sprint-notes-storage',
      storage: jsonFileStorage,
    }
  )
);
