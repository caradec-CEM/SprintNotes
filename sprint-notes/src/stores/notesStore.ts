import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DiscussionNotes, ActionItem, EngineerNotes, SprintNotes, EngineerTimeOff } from '../types';

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

// Default time off values
const DEFAULT_TIME_OFF: EngineerTimeOff = { ptoDays: 0, workingDays: 10 };

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
          return DEFAULT_TIME_OFF;
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

          const workingDays = Math.max(0, 10 - ptoDays);

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
    }),
    {
      name: 'sprint-notes-storage',
    }
  )
);
