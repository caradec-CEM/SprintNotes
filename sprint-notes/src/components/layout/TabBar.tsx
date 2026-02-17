import { TEAM_MEMBERS } from '../../config/team';
import './TabBar.css';

interface TabBarProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <nav className="tab-bar no-print">
      <button
        className={`tab-bar__tab ${activeTab === 'overview' ? 'tab-bar__tab--active' : ''}`}
        onClick={() => onTabChange('overview')}
      >
        Team Overview
      </button>

      <div className="tab-bar__divider" />

      {TEAM_MEMBERS.map((member) => (
        <button
          key={member.id}
          className={`tab-bar__tab ${activeTab === member.id ? 'tab-bar__tab--active' : ''}`}
          onClick={() => onTabChange(member.id)}
        >
          {member.avatarUrl && (
            <img
              src={member.avatarUrl}
              alt=""
              className="tab-bar__avatar"
            />
          )}
          <span className="tab-bar__name">{member.name.split(' ')[0]}</span>
        </button>
      ))}
    </nav>
  );
}
