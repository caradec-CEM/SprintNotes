import { useSprintStore } from '../../stores/sprintStore';
import { useNotesStore } from '../../stores/notesStore';
import './TimeOffEditor.css';

interface TimeOffEditorProps {
  engineerId: string;
}

export function TimeOffEditor({ engineerId }: TimeOffEditorProps) {
  const currentSprint = useSprintStore((state) => state.currentSprint);
  const getEngineerTimeOff = useNotesStore((state) => state.getEngineerTimeOff);
  const updateEngineerTimeOff = useNotesStore((state) => state.updateEngineerTimeOff);
  const getSprintCapacity = useNotesStore((state) => state.getSprintCapacity);

  if (!currentSprint) {
    return null;
  }

  const capacity = getSprintCapacity(currentSprint.id);
  const timeOff = getEngineerTimeOff(currentSprint.id, engineerId);
  const maxPto = capacity.effectiveSprintDays;

  const handlePtoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Math.min(maxPto, Math.max(0, parseInt(e.target.value) || 0));
    updateEngineerTimeOff(currentSprint.id, engineerId, value);
  };

  const capacityPercent = maxPto > 0
    ? Math.round((timeOff.workingDays / maxPto) * 100)
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
        {timeOff.workingDays} of {maxPto} effective days ({capacityPercent}%)
      </span>
      {capacity.teamHolidays > 0 && (
        <span className="time-off-editor__note">
          Sprint reduced by {capacity.teamHolidays}d holidays
        </span>
      )}
    </div>
  );
}
