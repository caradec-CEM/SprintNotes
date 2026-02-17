import { useCallback } from 'react';
import { useSprintStore } from '../../stores/sprintStore';
import { useNotesStore } from '../../stores/notesStore';
import type { DiscussionNotes as DiscussionNotesType } from '../../types';
import './DiscussionNotes.css';

interface DiscussionNotesProps {
  engineerId: string;
  notes: DiscussionNotesType;
}

const FIELD_LABELS: Record<keyof DiscussionNotesType, string> = {
  sprintFeedback: 'Sprint Feedback',
  longerThanExpected: 'Longer Than Expected',
  blockers: 'Blockers / Challenges',
  other: 'Other Notes',
};

const FIELD_PLACEHOLDERS: Record<keyof DiscussionNotesType, string> = {
  sprintFeedback: 'How did the sprint go? Any wins or concerns?',
  longerThanExpected: 'Which tickets took longer than expected and why?',
  blockers: 'What blockers or challenges came up?',
  other: 'Any other topics to discuss...',
};

export function DiscussionNotes({ engineerId, notes }: DiscussionNotesProps) {
  const selectedSprintId = useSprintStore((state) => state.selectedSprintId);
  const updateDiscussion = useNotesStore((state) => state.updateDiscussion);

  const handleChange = useCallback(
    (field: keyof DiscussionNotesType, value: string) => {
      if (selectedSprintId) {
        updateDiscussion(selectedSprintId, engineerId, field, value);
      }
    },
    [selectedSprintId, engineerId, updateDiscussion]
  );

  const fields = Object.keys(FIELD_LABELS) as Array<keyof DiscussionNotesType>;

  return (
    <div className="discussion-notes">
      {fields.map((field) => (
        <div key={field} className="discussion-notes__field">
          <label
            htmlFor={`${engineerId}-${field}`}
            className="discussion-notes__label"
          >
            {FIELD_LABELS[field]}
          </label>
          <textarea
            id={`${engineerId}-${field}`}
            className="discussion-notes__textarea"
            value={notes[field]}
            onChange={(e) => handleChange(field, e.target.value)}
            placeholder={FIELD_PLACEHOLDERS[field]}
            rows={3}
          />
        </div>
      ))}
    </div>
  );
}
