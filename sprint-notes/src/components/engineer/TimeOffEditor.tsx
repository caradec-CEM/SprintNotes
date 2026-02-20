import { useSprintStore } from '../../stores/sprintStore';
import { useNotesStore } from '../../stores/notesStore';
import { DEFAULT_SPRINT_CAPACITY, DEFAULT_TIME_OFF } from '../../utils/capacityUtils';
import './TimeOffEditor.css';

interface TimeOffEditorProps {
  engineerId: string;
}

export function TimeOffEditor({ engineerId }: TimeOffEditorProps) {
  const currentSprint = useSprintStore((state) => state.currentSprint);
  const sprintNotes = useNotesStore((state) => state.sprintNotes);
  const updateEngineerTimeOff = useNotesStore((state) => state.updateEngineerTimeOff);

  if (!currentSprint) {
    return null;
  }

  const notes = sprintNotes[currentSprint.id];
  const capacity = notes?.capacity ?? DEFAULT_SPRINT_CAPACITY;
  const timeOff = notes?.timeOff?.[engineerId] ?? { ...DEFAULT_TIME_OFF, workingDays: capacity.effectiveSprintDays };
  const maxPto = capacity.effectiveSprintDays;

  const handlePtoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Math.min(maxPto, Math.max(0, parseInt(e.target.value) || 0));
    updateEngineerTimeOff(currentSprint.id, engineerId, value);
  };

  const capacityPercent = capacity.defaultWorkingDays > 0
    ? Math.round((timeOff.workingDays / capacity.defaultWorkingDays) * 100)
    : 0;

  return (
    <div className="time-off-editor">
      <label className="time-off-editor__label">
        <span className="time-off-editor__text">PTO/Vacation Days:</span>
        <input
          type="number"
          min={0}
          max={maxPto}
          value={timeOff.ptoDays}
          onChange={handlePtoChange}
          className="time-off-editor__input"
        />
      </label>
      <span className="time-off-editor__working">
        {timeOff.workingDays} of {capacity.defaultWorkingDays} days ({capacityPercent}%)
      </span>
      {capacity.teamHolidays > 0 && (
        <span className="time-off-editor__note">
          Sprint reduced by {capacity.teamHolidays}d holidays
        </span>
      )}
    </div>
  );
}
