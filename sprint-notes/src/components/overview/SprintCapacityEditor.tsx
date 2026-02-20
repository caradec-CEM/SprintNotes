import { useSprintStore } from '../../stores/sprintStore';
import { useNotesStore } from '../../stores/notesStore';
import { TEAM_MEMBERS } from '../../config/team';
import { computeTeamCapacityPercent } from '../../utils/capacityUtils';
import './SprintCapacityEditor.css';

export function SprintCapacityEditor() {
  const currentSprint = useSprintStore((state) => state.currentSprint);
  const getSprintCapacity = useNotesStore((state) => state.getSprintCapacity);
  const updateSprintCapacity = useNotesStore((state) => state.updateSprintCapacity);
  const getEngineerTimeOff = useNotesStore((state) => state.getEngineerTimeOff);

  if (!currentSprint) return null;

  const capacity = getSprintCapacity(currentSprint.id);

  const engineerTimeOffs = TEAM_MEMBERS.map((m) =>
    getEngineerTimeOff(currentSprint.id, m.id)
  );
  const teamCapacity = computeTeamCapacityPercent(engineerTimeOffs, capacity.effectiveSprintDays);

  const handleSprintDaysChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Math.min(15, Math.max(1, parseInt(e.target.value) || 10));
    updateSprintCapacity(currentSprint.id, { defaultWorkingDays: value });
  };

  const handleHolidaysChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Math.min(capacity.defaultWorkingDays, Math.max(0, parseInt(e.target.value) || 0));
    updateSprintCapacity(currentSprint.id, { teamHolidays: value });
  };

  return (
    <div className="sprint-capacity">
      <label className="sprint-capacity__field">
        <span className="sprint-capacity__label">Sprint</span>
        <input
          type="number"
          min={1}
          max={15}
          value={capacity.defaultWorkingDays}
          onChange={handleSprintDaysChange}
          className="sprint-capacity__input"
        />
        <span className="sprint-capacity__unit">days</span>
      </label>
      <label className="sprint-capacity__field">
        <span className="sprint-capacity__label">Holidays</span>
        <input
          type="number"
          min={0}
          max={capacity.defaultWorkingDays}
          value={capacity.teamHolidays}
          onChange={handleHolidaysChange}
          className="sprint-capacity__input"
        />
        <span className="sprint-capacity__unit">days</span>
      </label>
      {capacity.teamHolidays > 0 && (
        <span className="sprint-capacity__effective">
          {capacity.effectiveSprintDays}d effective
        </span>
      )}
      <span className={`sprint-capacity__percent sprint-capacity__percent--${teamCapacity >= 90 ? 'good' : teamCapacity >= 70 ? 'warn' : 'low'}`}>
        {teamCapacity}% capacity
      </span>
    </div>
  );
}
