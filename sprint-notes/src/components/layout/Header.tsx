import { useState } from 'react';
import { SprintSelector } from '../common';
import { useSprintStore } from '../../stores/sprintStore';
import { useThemeStore } from '../../stores/themeStore';
import { TeamSettingsModal } from './TeamSettingsModal';
import './Header.css';

export function Header() {
  const ticketsLoading = useSprintStore((state) => state.ticketsLoading);
  const isDark = useThemeStore((state) => state.isDark);
  const toggleTheme = useThemeStore((state) => state.toggle);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <header className="header">
      <div className="header__title-section">
        <h1 className="header__title">Sprint Notes</h1>
        <span className="header__subtitle">1:1 Meeting Prep</span>
      </div>

      <div className="header__controls">
        <SprintSelector />
        {ticketsLoading && (
          <span className="header__loading-indicator">Loading...</span>
        )}
        <button
          className="header__icon-btn"
          onClick={() => setSettingsOpen(true)}
          title="Team settings"
          aria-label="Open team settings"
        >
          ⚙
        </button>
        <button
          className="header__icon-btn"
          onClick={toggleTheme}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? '☀️' : '🌙'}
        </button>
      </div>

      <TeamSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}
