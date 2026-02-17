import { useSprintStore } from '../../stores/sprintStore';
import { useSprints } from '../../hooks/useJiraQuery';
import { LoadingSpinner } from './LoadingSpinner';
import './SprintSelector.css';

export function SprintSelector() {
  const { sprints, loading, error } = useSprints();
  const selectedSprintId = useSprintStore((state) => state.selectedSprintId);
  const setSelectedSprintId = useSprintStore((state) => state.setSelectedSprintId);

  if (loading && sprints.length === 0) {
    return (
      <div className="sprint-selector sprint-selector--loading">
        <LoadingSpinner size="sm" />
        <span>Loading sprints...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sprint-selector sprint-selector--error">
        <span>Failed to load sprints</span>
      </div>
    );
  }

  return (
    <div className="sprint-selector">
      <label htmlFor="sprint-select" className="sprint-selector__label">
        Sprint:
      </label>
      <select
        id="sprint-select"
        className="sprint-selector__select"
        value={selectedSprintId || ''}
        onChange={(e) => setSelectedSprintId(e.target.value)}
      >
        {sprints.map((sprint) => (
          <option key={sprint.id} value={sprint.id}>
            {sprint.name}
            {sprint.state === 'active' && ' (Active)'}
          </option>
        ))}
      </select>
    </div>
  );
}
