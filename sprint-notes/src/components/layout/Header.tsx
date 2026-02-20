import { SprintSelector } from '../common';
import { useSprintStore } from '../../stores/sprintStore';
import { useThemeStore } from '../../stores/themeStore';
import './Header.css';

export function Header() {
  const ticketsLoading = useSprintStore((state) => state.ticketsLoading);
  const isDark = useThemeStore((state) => state.isDark);
  const toggleTheme = useThemeStore((state) => state.toggle);

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
          className="header__theme-toggle"
          onClick={toggleTheme}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? '☀️' : '🌙'}
        </button>
      </div>
    </header>
  );
}
