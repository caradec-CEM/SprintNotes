import { useSprintStore } from '../../stores/sprintStore';
import { useNotesStore } from '../../stores/notesStore';
import { useHistoryStore } from '../../stores/historyStore';
import { useEngineerMembers } from '../../stores/teamStore';
import {
  DEFAULT_SPRINT_CAPACITY,
  DEFAULT_TIME_OFF,
  computeTeamCapacityPercent,
  computeExpectedPoints,
} from '../../utils/capacityUtils';
import './SprintCapacityEditor.css';

export function SprintCapacityEditor() {
  const currentSprint = useSprintStore((state) => state.currentSprint);
  const sprintNotes = useNotesStore((state) => state.sprintNotes);
  const updateSprintCapacity = useNotesStore((state) => state.updateSprintCapacity);
  const getRecentSprints = useHistoryStore((state) => state.getRecentSprints);
  const members = useEngineerMembers();

  if (!currentSprint) return null;

  const notes = sprintNotes[currentSprint.id];
  const capacity = notes?.capacity ?? DEFAULT_SPRINT_CAPACITY;

  const engineerTimeOffs = members.map((m) =>
    notes?.timeOff?.[m.id] ?? { ...DEFAULT_TIME_OFF, workingDays: capacity.effectiveSprintDays }
  );
  const teamCapacity = computeTeamCapacityPercent(engineerTimeOffs, capacity.defaultWorkingDays);

  // Baseline: recent 6-sprint avg of total points (excludes current sprint)
  const recent = getRecentSprints(6, currentSprint.id);
  const recentPts = recent.map((s) => s.totalPoints ?? 0).filter((n) => n > 0);
  const avgPts = recentPts.length > 0
    ? Math.round(recentPts.reduce((a, b) => a + b, 0) / recentPts.length)
    : 0;
  const expectedPts = computeExpectedPoints(avgPts, teamCapacity);

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
      {expectedPts !== null && (
        <span
          className="sprint-capacity__expected"
          title={`Recent ${recentPts.length}-sprint avg (${avgPts} pts) scaled to this sprint's capacity`}
        >
          ~{expectedPts} pts expected
        </span>
      )}
    </div>
  );
}
