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

  if (!currentSprint) {
    return null;
  }

  const timeOff = getEngineerTimeOff(currentSprint.id, engineerId);

  const handlePtoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Math.min(10, Math.max(0, parseInt(e.target.value) || 0));
    updateEngineerTimeOff(currentSprint.id, engineerId, value);
  };

  return (
    <div className="time-off-editor">
      <label className="time-off-editor__label">
        <span className="time-off-editor__text">PTO/Vacation Days:</span>
        <input
          type="number"
          min={0}
          max={10}
          value={timeOff.ptoDays}
          onChange={handlePtoChange}
          className="time-off-editor__input"
        />
      </label>
      <span className="time-off-editor__working">
        ({timeOff.workingDays} working days)
      </span>
    </div>
  );
}
