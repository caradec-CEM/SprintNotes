import { useMemo } from 'react';
import { useSprintStore } from '../stores/sprintStore';
import { useNotesStore } from '../stores/notesStore';
import type { Ticket, EngineerMetrics, EngineerNotes } from '../types';

export interface EngineerData {
  // Tickets
  devTickets: Ticket[];
  reviewTickets: Ticket[];
  itTickets: Ticket[];
  allTickets: Ticket[];

  // Metrics
  metrics: EngineerMetrics;

  // Notes
  notes: EngineerNotes;
}

export function useEngineerData(engineerId: string): EngineerData {
  const currentSprint = useSprintStore((state) => state.currentSprint);
  const selectedSprintId = useSprintStore((state) => state.selectedSprintId);
  const getEngineerNotes = useNotesStore((state) => state.getEngineerNotes);

  return useMemo(() => {
    const tickets = currentSprint?.tickets ?? [];

    // Categorize tickets
    const devTickets = tickets.filter(
      (t) => t.developer === engineerId && t.project === 'CP'
    );
    const reviewTickets = tickets.filter(
      (t) => t.reviewer === engineerId && t.project === 'CP'
    );
    const itTickets = tickets.filter(
      (t) => t.assignee === engineerId && t.project === 'IT'
    );

    // All tickets this engineer touched
    const allTickets = tickets.filter(
      (t) =>
        t.developer === engineerId ||
        t.reviewer === engineerId ||
        t.assignee === engineerId
    );

    // Calculate metrics
    const devPts = devTickets.reduce((sum, t) => sum + t.points, 0);
    const reviewPts = reviewTickets.reduce((sum, t) => sum + t.points, 0);

    const metrics: EngineerMetrics = {
      totalItems: allTickets.length,
      devCount: devTickets.length,
      reviewCount: reviewTickets.length,
      devPts,
      reviewPts,
      itCount: itTickets.length,
    };

    // Get notes
    const notes = selectedSprintId
      ? getEngineerNotes(selectedSprintId, engineerId)
      : {
          discussion: {
            sprintFeedback: '',
            longerThanExpected: '',
            blockers: '',
            other: '',
          },
          actionItems: [],
        };

    return {
      devTickets,
      reviewTickets,
      itTickets,
      allTickets,
      metrics,
      notes,
    };
  }, [currentSprint, selectedSprintId, engineerId, getEngineerNotes]);
}
