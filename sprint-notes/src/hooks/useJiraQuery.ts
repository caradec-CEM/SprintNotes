import { useEffect, useCallback, useRef } from 'react';
import { useSprintStore } from '../stores/sprintStore';
import { useHistoryStore, createSprintSummary } from '../stores/historyStore';
import { fetchSprints, fetchSprintData, fetchSprintIssues } from '../services/jiraService';
import type { Sprint } from '../types';

// Hook to load available sprints
export function useSprints() {
  const {
    sprints,
    sprintsLoading,
    sprintsError,
    setSprints,
    setSprintsLoading,
    setSprintsError,
    setSelectedSprintId,
    selectedSprintId,
  } = useSprintStore();

  const { addSprintSummary, history } = useHistoryStore();
  const historyLoadedRef = useRef(false);

  // Pre-load history for the last 6 closed sprints (for trends)
  const preloadSprintHistory = useCallback(async (sprintList: Sprint[]) => {
    if (historyLoadedRef.current) return;
    historyLoadedRef.current = true;

    // Get last 6 closed sprints (excluding active)
    const closedSprints = sprintList
      .filter(s => s.state === 'closed')
      .slice(0, 6);

    // Load each sprint's data in background (don't await all at once to avoid rate limits)
    for (const sprint of closedSprints) {
      // Skip if already in history
      if (history.sprints.some(h => h.id === sprint.id)) continue;

      try {
        const tickets = await fetchSprintIssues(sprint.id, sprint.endDate);
        const summary = createSprintSummary(
          sprint.id,
          sprint.name,
          sprint.endDate || '',
          tickets
        );
        addSprintSummary(summary);
      } catch (e) {
        console.warn(`Failed to load history for sprint ${sprint.id}`, e);
      }
    }
  }, [addSprintSummary, history.sprints]);

  const loadSprints = useCallback(async () => {
    setSprintsLoading(true);
    setSprintsError(null);

    try {
      const fetchedSprints = await fetchSprints('active,closed');
      setSprints(fetchedSprints);

      // Auto-select most recent closed sprint (the one before active)
      if (!selectedSprintId && fetchedSprints.length > 0) {
        const firstClosedSprint = fetchedSprints.find(s => s.state === 'closed');
        setSelectedSprintId(firstClosedSprint?.id || fetchedSprints[0].id);
      }

      // Pre-load sprint history for trends (in background)
      preloadSprintHistory(fetchedSprints);
    } catch (error) {
      setSprintsError(
        error instanceof Error ? error.message : 'Failed to load sprints'
      );
    } finally {
      setSprintsLoading(false);
    }
  }, [setSprints, setSprintsLoading, setSprintsError, setSelectedSprintId, selectedSprintId, preloadSprintHistory]);

  useEffect(() => {
    if (sprints.length === 0 && !sprintsLoading) {
      loadSprints();
    }
  }, []);

  return {
    sprints,
    loading: sprintsLoading,
    error: sprintsError,
    reload: loadSprints,
  };
}

// Hook to load sprint data when selection changes
export function useSprintData() {
  const {
    selectedSprintId,
    currentSprint,
    ticketsLoading,
    ticketsError,
    setCurrentSprint,
    setTicketsLoading,
    setTicketsError,
  } = useSprintStore();

  const { addSprintSummary } = useHistoryStore();

  const loadSprintData = useCallback(async (sprintId: string) => {
    setTicketsLoading(true);
    setTicketsError(null);

    try {
      const data = await fetchSprintData(sprintId);

      if (data) {
        setCurrentSprint({
          id: data.sprint.id,
          name: data.sprint.name,
          date: data.sprint.endDate || new Date().toISOString().split('T')[0],
          startDate: data.sprint.startDate,
          tickets: data.tickets,
        });

        // Add to history for trends
        const summary = createSprintSummary(
          data.sprint.id,
          data.sprint.name,
          data.sprint.endDate || new Date().toISOString().split('T')[0],
          data.tickets
        );
        addSprintSummary(summary);
      }
    } catch (error) {
      setTicketsError(
        error instanceof Error ? error.message : 'Failed to load sprint data'
      );
    } finally {
      setTicketsLoading(false);
    }
  }, [setCurrentSprint, setTicketsLoading, setTicketsError, addSprintSummary]);

  useEffect(() => {
    if (selectedSprintId) {
      loadSprintData(selectedSprintId);
    }
  }, [selectedSprintId, loadSprintData]);

  return {
    sprintData: currentSprint,
    loading: ticketsLoading,
    error: ticketsError,
    reload: () => selectedSprintId && loadSprintData(selectedSprintId),
  };
}
