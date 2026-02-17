import { useState, useCallback } from 'react';
import { useSprintStore } from '../../stores/sprintStore';
import { useNotesStore } from '../../stores/notesStore';
import type { ActionItem } from '../../types';
import './ActionItems.css';

interface ActionItemsProps {
  engineerId: string;
  items: ActionItem[];
}

export function ActionItems({ engineerId, items }: ActionItemsProps) {
  const [newItemText, setNewItemText] = useState('');
  const selectedSprintId = useSprintStore((state) => state.selectedSprintId);
  const { addActionItem, toggleActionItem, updateActionItem, deleteActionItem } =
    useNotesStore();

  const handleAdd = useCallback(() => {
    if (!selectedSprintId || !newItemText.trim()) return;
    addActionItem(selectedSprintId, engineerId, newItemText.trim());
    setNewItemText('');
  }, [selectedSprintId, engineerId, newItemText, addActionItem]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd]
  );

  const handleToggle = useCallback(
    (itemId: string) => {
      if (!selectedSprintId) return;
      toggleActionItem(selectedSprintId, engineerId, itemId);
    },
    [selectedSprintId, engineerId, toggleActionItem]
  );

  const handleDelete = useCallback(
    (itemId: string) => {
      if (!selectedSprintId) return;
      deleteActionItem(selectedSprintId, engineerId, itemId);
    },
    [selectedSprintId, engineerId, deleteActionItem]
  );

  const handleTextChange = useCallback(
    (itemId: string, text: string) => {
      if (!selectedSprintId) return;
      updateActionItem(selectedSprintId, engineerId, itemId, { text });
    },
    [selectedSprintId, engineerId, updateActionItem]
  );

  return (
    <div className="action-items">
      <ul className="action-items__list">
        {items.map((item) => (
          <li
            key={item.id}
            className={`action-items__item ${
              item.completed ? 'action-items__item--completed' : ''
            }`}
          >
            <label className="action-items__checkbox-label">
              <input
                type="checkbox"
                checked={item.completed}
                onChange={() => handleToggle(item.id)}
                className="action-items__checkbox"
              />
              <span className="action-items__checkmark" />
            </label>
            <input
              type="text"
              value={item.text}
              onChange={(e) => handleTextChange(item.id, e.target.value)}
              className="action-items__text"
            />
            <button
              onClick={() => handleDelete(item.id)}
              className="action-items__delete no-print"
              aria-label="Delete item"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <div className="action-items__add no-print">
        <input
          type="text"
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Add an action item..."
          className="action-items__input"
        />
        <button
          onClick={handleAdd}
          disabled={!newItemText.trim()}
          className="btn btn-primary action-items__add-btn"
        >
          Add
        </button>
      </div>
    </div>
  );
}
